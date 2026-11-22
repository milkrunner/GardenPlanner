// Wiederholungslogik für Aufgaben (#327). Reine Funktionen ohne Dateizugriff.
// Alle Berechnungen laufen in UTC, damit das Ergebnis nicht von der Zeitzone des Servers abhängt.

const RECURRENCES = ['daily', 'weekly', 'monthly'];

function daysInMonthUtc(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// Addiert Kalendermonate und begrenzt den Tag auf den letzten Tag des Zielmonats:
// 31. Jan + 1 Monat = 28. Feb (29. im Schaltjahr), 31. Mär + 1 Monat = 30. Apr.
// (Das bloße setMonth() des Browsers würde in den Folgemonat überlaufen: 31. Jan -> 3. Mär.)
function addMonthsClamped(date, months) {
    const result = new Date(date.getTime());
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const lastDay = daysInMonthUtc(result.getUTCFullYear(), result.getUTCMonth());
    result.setUTCDate(Math.min(day, lastDay));
    return result;
}

// Liefert das nächste Fälligkeitsdatum als ISO-String, für `none`/unbekannte Werte oder ein
// ungültiges Ausgangsdatum null.
function calculateNextDue(recurrence, fromDate = new Date()) {
    const from = new Date(fromDate);
    if (Number.isNaN(from.getTime())) return null;
    switch (recurrence) {
        case 'daily': {
            const next = new Date(from.getTime());
            next.setUTCDate(next.getUTCDate() + 1);
            return next.toISOString();
        }
        case 'weekly': {
            const next = new Date(from.getTime());
            next.setUTCDate(next.getUTCDate() + 7);
            return next.toISOString();
        }
        case 'monthly':
            return addMonthsClamped(from, 1).toISOString();
        default:
            return null;
    }
}

function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

// Datum `YYYY-MM-DD` plus Intervall als `YYYY-MM-DD` (reines Kalenderdatum, UTC); null für `none`/ungültig.
function addIntervalToDate(recurrence, dateString) {
    const from = new Date(`${dateString}T00:00:00.000Z`);
    if (typeof dateString !== 'string' || Number.isNaN(from.getTime())) return null;
    const next = calculateNextDue(recurrence, from);
    return next ? formatDate(new Date(next)) : null;
}

// Fälligkeitsdatum der Folgeaufgabe (#344): altes Fälligkeitsdatum plus Intervall hält den Rhythmus
// (31. Jan + 1 Monat = Monatsende). Ohne altes Datum gilt der Abschlusstag (UTC) plus Intervall. Läge das Ergebnis
// nicht nach dem Abschlusstag (verspätet erledigt), zählt ebenfalls Abschlusstag plus Intervall, damit die
// Folgeaufgabe nicht sofort überfällig ist.
function calculateNextDueDate(recurrence, previousDueDate, completedAt) {
    const completed = new Date(completedAt);
    if (Number.isNaN(completed.getTime())) return null;
    const completionDay = formatDate(completed);
    const fromCompletion = addIntervalToDate(recurrence, completionDay);
    if (!previousDueDate) return fromCompletion;
    const fromPrevious = addIntervalToDate(recurrence, previousDueDate);
    return fromPrevious && fromPrevious > completionDay ? fromPrevious : fromCompletion;
}

function isRecurring(recurrence) {
    return RECURRENCES.includes(recurrence);
}

module.exports = { RECURRENCES, calculateNextDue, calculateNextDueDate, addMonthsClamped, isRecurring };
