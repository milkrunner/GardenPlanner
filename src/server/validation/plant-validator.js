// --- Plant validation and sanitization ---
//
// Plants are curated library entries that the browser renders. Text is stored as plain text (trimmed,
// control characters removed, NFC-normalized) and the characters < and > are rejected outright: the UI
// escapes on output, this is defence in depth against markup in names, tips or companion lists.

const ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const SUN_LEVELS = ['full', 'partial', 'shade'];
const WATER_LEVELS = ['low', 'medium', 'high'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

const LIMITS = {
    id: 40,
    name: 60,
    category: 40,
    icon: 8, // Unicode code points: enough for a ZWJ emoji sequence, too short for a text payload
    spacing: 30,
    germination: 40,
    harvest: 60,
    tips: 1000,
    listItem: 60,
    listLength: 30,
};

const DEFAULT_ICON = '🌱'; // seedling

const FIELDS = [
    'name',
    'category',
    'icon',
    'difficulty',
    'sun',
    'water',
    'season',
    'sowMonths',
    'spacing',
    'germination',
    'harvest',
    'companions',
    'avoid',
    'tips',
];

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
const ANGLE_BRACKETS = /[<>]/;

function cleanText(value, { multiline = false } = {}) {
    let text = value.normalize('NFC').replace(CONTROL_CHARS, '');
    if (!multiline) text = text.replace(/\s+/g, ' ');
    return text.trim();
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugify(name) {
    // Split/join instead of trimming hyphens with a regex: linear time on any input (CodeQL: polynomial regex)
    const slug = String(name)
        .normalize('NFD')
        .replace(/\u00df/g, 'ss')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .join('-')
        .slice(0, LIMITS.id);
    // A cut at the length limit can leave one trailing hyphen (segments never contain two in a row)
    return slug.endsWith('-') ? slug.slice(0, -1) : slug;
}

function validateText(data, field, label, { required, nonEmpty = required, max, multiline }, errors) {
    const value = data[field];
    if (value === undefined) {
        if (required) errors.push(`${label} muss angegeben werden (max ${max} Zeichen)`);
        return;
    }
    if (typeof value !== 'string') {
        errors.push(`${label} muss ein Text sein`);
        return;
    }
    const text = cleanText(value, { multiline });
    if (nonEmpty && text.length < 1) {
        errors.push(`${label} muss angegeben werden (max ${max} Zeichen)`);
    } else if (text.length > max) {
        errors.push(`${label} darf maximal ${max} Zeichen lang sein`);
    } else if (ANGLE_BRACKETS.test(text)) {
        errors.push(`${label} darf keine spitzen Klammern (< >) enthalten`);
    }
}

function validateEnum(data, field, label, allowed, errors) {
    if (data[field] !== undefined && !allowed.includes(data[field])) {
        errors.push(`Ungültiger Wert für ${label} (erlaubt: ${allowed.join(', ')})`);
    }
}

function validateList(data, field, label, errors) {
    const value = data[field];
    if (value === undefined) return;
    if (!Array.isArray(value)) {
        errors.push(`${label} muss ein Array sein`);
        return;
    }
    if (value.length > LIMITS.listLength) {
        errors.push(`${label}: maximal ${LIMITS.listLength} Einträge erlaubt`);
        return;
    }
    value.forEach((item, i) => {
        if (typeof item !== 'string') {
            errors.push(`${label} ${i + 1}: muss ein Text sein`);
            return;
        }
        const text = cleanText(item);
        if (text.length < 1 || text.length > LIMITS.listItem) {
            errors.push(`${label} ${i + 1}: muss zwischen 1 und ${LIMITS.listItem} Zeichen lang sein`);
        } else if (ANGLE_BRACKETS.test(text)) {
            errors.push(`${label} ${i + 1}: darf keine spitzen Klammern (< >) enthalten`);
        }
    });
}

function validateSeason(data, errors) {
    const value = data.season;
    if (value === undefined) return;
    if (!Array.isArray(value)) {
        errors.push('Saison muss ein Array sein');
    } else if (value.some((s) => !SEASONS.includes(s))) {
        errors.push(`Ungültige Saison (erlaubt: ${SEASONS.join(', ')})`);
    }
}

// Aussaatmonate (#349): Zahlen 1-12 (Januar-Dezember), jeder Monat höchstens einmal. Ein leeres Array heißt
// "keine Angabe"; Vorschläge fallen dann auf die Saison zurück.
function validateSowMonths(data, errors) {
    const value = data.sowMonths;
    if (value === undefined) return;
    if (!Array.isArray(value)) {
        errors.push('Aussaatmonate müssen ein Array sein');
    } else if (value.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) {
        errors.push('Ungültige Aussaatmonate (erlaubt: ganze Zahlen von 1 bis 12)');
    }
}

function validateIcon(data, errors) {
    if (data.icon === undefined) return;
    if (typeof data.icon !== 'string') {
        errors.push('Icon muss ein Text sein');
        return;
    }
    const icon = cleanText(data.icon);
    const length = [...icon].length;
    if (length < 1 || length > LIMITS.icon) {
        errors.push(`Icon muss zwischen 1 und ${LIMITS.icon} Zeichen lang sein`);
    } else if (ANGLE_BRACKETS.test(icon)) {
        errors.push('Icon darf keine spitzen Klammern (< >) enthalten');
    }
}

// `partial` is used by PUT: only the sent fields are checked, name and category stay optional there.
// A client-supplied id is only accepted on create (`allowId`); on update it has to match the URL, which the
// service checks.
function validatePlant(data, { partial = false, allowId = false } = {}) {
    if (!isPlainObject(data)) {
        return { valid: false, errors: ['Der Request-Body muss ein JSON-Objekt sein'] };
    }
    const errors = [];

    if (allowId && data.id !== undefined) {
        if (
            typeof data.id !== 'string' ||
            data.id.length < 1 ||
            data.id.length > LIMITS.id ||
            !ID_REGEX.test(data.id)
        ) {
            errors.push(
                `ID muss ein Slug aus Kleinbuchstaben, Ziffern und Bindestrichen sein (1–${LIMITS.id} Zeichen)`,
            );
        }
    }

    validateText(data, 'name', 'Name', { required: !partial, nonEmpty: true, max: LIMITS.name }, errors);
    validateText(data, 'category', 'Kategorie', { required: !partial, nonEmpty: true, max: LIMITS.category }, errors);
    validateIcon(data, errors);
    validateEnum(data, 'difficulty', 'Schwierigkeit', DIFFICULTIES, errors);
    validateEnum(data, 'sun', 'Sonne', SUN_LEVELS, errors);
    validateEnum(data, 'water', 'Wasser', WATER_LEVELS, errors);
    validateSeason(data, errors);
    validateSowMonths(data, errors);
    validateText(data, 'spacing', 'Abstand', { max: LIMITS.spacing }, errors);
    validateText(data, 'germination', 'Keimdauer', { max: LIMITS.germination }, errors);
    validateText(data, 'harvest', 'Erntezeit', { max: LIMITS.harvest }, errors);
    validateList(data, 'companions', 'Partner', errors);
    validateList(data, 'avoid', 'Unverträglich', errors);
    validateText(data, 'tips', 'Tipps', { max: LIMITS.tips, multiline: true }, errors);

    return { valid: errors.length === 0, errors };
}

function cleanList(list) {
    return [...new Set(list.map((item) => cleanText(item)))];
}

// Only call with data that passed validatePlant. Returns just the known fields that were sent.
function sanitizePlantData(data) {
    const sanitized = {};
    for (const field of FIELDS) {
        const value = data[field];
        if (value === undefined) continue;
        if (field === 'season') sanitized.season = SEASONS.filter((s) => value.includes(s));
        else if (field === 'sowMonths') sanitized.sowMonths = [...new Set(value)].sort((a, b) => a - b);
        else if (field === 'companions' || field === 'avoid') sanitized[field] = cleanList(value);
        else if (['difficulty', 'sun', 'water'].includes(field)) sanitized[field] = value;
        else sanitized[field] = cleanText(value, { multiline: field === 'tips' });
    }
    return sanitized;
}

module.exports = {
    ID_REGEX,
    DEFAULT_ICON,
    LIMITS,
    FIELDS,
    slugify,
    validatePlant,
    sanitizePlantData,
};
