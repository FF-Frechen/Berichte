// Input-Validierung für Feuerwehr-Berichte System
// Schützt vor ungültigen und potentiell gefährlichen Eingaben

/**
 * Validiert Einsatznummer
 * Format: Alphanumerisch, Bindestriche, Schrägstriche erlaubt
 * Beispiel: 2025-001, E2025/12
 */
function validateEinsatznummer(einsatznummer) {
    if (!einsatznummer || typeof einsatznummer !== 'string') {
        return { valid: false, error: 'Einsatznummer erforderlich' };
    }

    // Maximal 50 Zeichen
    if (einsatznummer.length > 50) {
        return { valid: false, error: 'Einsatznummer zu lang (max. 50 Zeichen)' };
    }

    // Nur alphanumerisch plus - / _
    const pattern = /^[a-zA-Z0-9\-\/_ ]+$/;
    if (!pattern.test(einsatznummer)) {
        return { valid: false, error: 'Einsatznummer enthält ungültige Zeichen' };
    }

    return { valid: true };
}

/**
 * Validiert Datum im Format DD.MM.YYYY oder YYYY-MM-DD
 */
function validateDatum(datum) {
    if (!datum || typeof datum !== 'string') {
        return { valid: false, error: 'Datum erforderlich' };
    }

    // Format DD.MM.YYYY oder YYYY-MM-DD
    const pattern1 = /^\d{2}\.\d{2}\.\d{4}$/;
    const pattern2 = /^\d{4}-\d{2}-\d{2}$/;

    if (!pattern1.test(datum) && !pattern2.test(datum)) {
        return { valid: false, error: 'Ungültiges Datumsformat (erwartet: DD.MM.YYYY oder YYYY-MM-DD)' };
    }

    return { valid: true };
}

/**
 * Validiert Uhrzeit im Format HH:MM
 */
function validateUhrzeit(uhrzeit) {
    if (!uhrzeit || typeof uhrzeit !== 'string') {
        return { valid: false, error: 'Uhrzeit erforderlich' };
    }

    const pattern = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!pattern.test(uhrzeit)) {
        return { valid: false, error: 'Ungültiges Zeitformat (erwartet: HH:MM)' };
    }

    return { valid: true };
}

/**
 * Validiert Text-Felder mit maximaler Länge
 */
function validateText(text, fieldName, maxLength = 500) {
    if (text && typeof text === 'string' && text.length > maxLength) {
        return { valid: false, error: `${fieldName} zu lang (max. ${maxLength} Zeichen)` };
    }
    return { valid: true };
}

/**
 * Validiert Namen (für Autocomplete)
 */
function validateName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: true }; // Namen können leer sein
    }

    if (name.length > 100) {
        return { valid: false, error: 'Name zu lang (max. 100 Zeichen)' };
    }

    return { valid: true };
}

/**
 * Validiert Fahrzeug-ID
 */
function validateFahrzeugId(id) {
    if (!id || typeof id !== 'string') {
        return { valid: false, error: 'Fahrzeug-ID erforderlich' };
    }

    // Nur lowercase alphanumerisch plus -
    const pattern = /^[a-z0-9\-]+$/;
    if (!pattern.test(id)) {
        return { valid: false, error: 'Ungültige Fahrzeug-ID' };
    }

    if (id.length > 50) {
        return { valid: false, error: 'Fahrzeug-ID zu lang' };
    }

    return { valid: true };
}

/**
 * Sanitiert HTML-Strings (entfernt potentiell gefährliche Zeichen)
 */
function sanitizeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

module.exports = {
    validateEinsatznummer,
    validateDatum,
    validateUhrzeit,
    validateText,
    validateName,
    validateFahrzeugId,
    sanitizeHtml
};
