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

function isRecurring(recurrence) {
    return RECURRENCES.includes(recurrence);
}

module.exports = { RECURRENCES, calculateNextDue, addMonthsClamped, isRecurring };
