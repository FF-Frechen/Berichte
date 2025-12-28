const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const multer = require('multer');
// Input-Validierung optional (nur wenn Modul vorhanden)
let validation;
try {
    validation = require('./validation');
} catch (err) {
    console.log('⚠ validation.js nicht gefunden - Validierung deaktiviert (OK für lokale Nutzung)');
    validation = null;
}

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Multer für File-Uploads
const upload = multer({ storage: multer.memoryStorage() });

// === KONFIGURATION ===
const DELETE_PASSWORD = process.env.DELETE_PASSWORD;
if (!DELETE_PASSWORD) {
    console.error('FATAL ERROR: DELETE_PASSWORD nicht in Umgebungsvariablen gesetzt!');
    process.exit(1);
}
const DELETE_PASSWORD_HASH = crypto.createHash('sha256').update(DELETE_PASSWORD).digest('hex');

const SMTP_CONFIG = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER ? process.env.SMTP_USER.trim() : '',
        pass: process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : ''
    }
};

// SMTP-Konfiguration beim Start ausgeben
console.log('=== SMTP-Konfiguration ===');
console.log('SMTP_HOST:', SMTP_CONFIG.host);
console.log('SMTP_PORT:', SMTP_CONFIG.port);
console.log('SMTP_SECURE:', SMTP_CONFIG.secure);
console.log('SMTP_USER:', SMTP_CONFIG.auth.user);
console.log('SMTP_PASS vorhanden:', SMTP_CONFIG.auth.pass ? `Ja (${SMTP_CONFIG.auth.pass.length} Zeichen)` : 'NEIN!');
console.log('========================');

// Namen aus Environment (Pflichtfeld)
const NAMEN_ENV = process.env.NAMEN;
if (!NAMEN_ENV) {
    console.error('FATAL ERROR: NAMEN nicht in Umgebungsvariablen gesetzt!');
    process.exit(1);
}

// Namenslisten-Stand (optional, mit Default)
const NAMENSLISTE_STAND = process.env.NAMENSLISTE_STAND || new Date().toLocaleDateString('de-DE');

// === FAHRZEUG-KONFIGURATION AUS .ENV ===
// Liest alle VEHICLE_X_* Variablen und erstellt daraus die benötigten Mappings
function loadVehiclesFromEnv() {
    const vehicles = [];
    const fahrzeugMapping = {};
    const besatzungenMapping = {};
    const fahrzeugNamenMapping = {};

    // Finde alle Fahrzeug-Definitionen
    let i = 1;
    while (true) {
        const id = process.env[`VEHICLE_${i}_ID`];
        const name = process.env[`VEHICLE_${i}_NAME`];
        const displayName = process.env[`VEHICLE_${i}_DISPLAY_NAME`];
        const functionsStr = process.env[`VEHICLE_${i}_FUNCTIONS`];

        // Wenn keine ID mehr gefunden wird, sind wir fertig
        if (!id) break;

        // Validierung
        if (!name || !displayName || !functionsStr) {
            console.warn(`WARN: Fahrzeug ${i} (ID: ${id}) ist unvollständig konfiguriert. Überspringe.`);
            i++;
            continue;
        }

        // Parse Funktionen (komma-separiert)
        const functions = functionsStr.split(',').map(f => f.trim()).filter(f => f);

        // Speichere in Mappings (Reihenfolge wird beibehalten)
        vehicles.push({
            id,
            name,
            displayName,
            functions
        });

        fahrzeugMapping[id] = name;
        besatzungenMapping[id] = functions;
        fahrzeugNamenMapping[id] = displayName;

        i++;
    }

    if (vehicles.length === 0) {
        console.error('FATAL ERROR: Keine Fahrzeuge in Umgebungsvariablen gefunden!');
        console.error('Bitte .env.fahrzeuge.example nach .env.fahrzeuge kopieren und anpassen.');
        process.exit(1);
    }

    console.log(`✓ ${vehicles.length} Fahrzeuge aus Umgebungsvariablen geladen`);

    return {
        vehicles,
        fahrzeugMapping,
        besatzungenMapping,
        fahrzeugNamenMapping
    };
}

const VEHICLE_CONFIG = loadVehiclesFromEnv();

// Funktions-Mapping für PDF-Abkürzungen (bleibt global, da für alle Fahrzeuge gleich)
const funktionsMapping = {
    'Gruppenführer': 'GF',
    'Maschinist': 'MA',
    'Angriffstrupp - Führer': 'AT (F)',
    'Angriffstrupp - Mann': 'AT (M)',
    'Wassertrupp - Führer': 'WT (F)',
    'Wassertrupp - Mann': 'WT (M)',
    'Schlauchtrupp - Führer': 'ST (F)',
    'Schlauchtrupp - Mann': 'ST (M)',
    'Melder': 'ME',
    'Einsatzleiter': 'GF / ZF',
    'Fahrer': 'MA',
    'Staffelführer': 'GF',
    'Truppführer': 'TF',
    'Truppführer 1': 'TF 1',
    'Truppmann 1': 'TM 1',
    'Truppführer 2': 'TF 2',
    'Truppmann 2': 'TM 2',
    'Truppmann 3': 'TM 3',
    'Truppmann 4': 'TM 4',
    'Truppmann 5': 'TM 5',
    'Truppmann 6': 'TM 6',
    'Truppmann 7': 'TM 7',
    'Truppmann': 'TM',
    'Kreisbrandmeister': 'GF / ZF',
    'Beifahrer': 'TM',
    'Mitfahrer 1': 'MF 1',
    'Mitfahrer 2': 'MF 2',
    'Mitfahrer 3': 'MF 3',
    'Lagedienstführer': 'LDF',
    'Disponent 1': 'DISP 1',
    'Disponent 2': 'DISP 2',
    'Lagekarte': 'LK',
    'ZBV': 'ZBV'
};

// E-Mail-Empfänger aus Environment (Pflichtfeld für E-Mail-Versand)
const EMAIL_RECIPIENTS_BERICHT = process.env.EMAIL_RECIPIENTS_BERICHT;
if (!EMAIL_RECIPIENTS_BERICHT) {
    console.warn('WARN: EMAIL_RECIPIENTS_BERICHT nicht gesetzt. E-Mail-Versand für Einsatzberichte wird deaktiviert.');
}

let mailTransporter = null;
if (SMTP_CONFIG.auth.user && SMTP_CONFIG.auth.pass) {
    try {
        mailTransporter = nodemailer.createTransport(SMTP_CONFIG);
        console.log('✓ Mail-Transporter erfolgreich erstellt');
    } catch (error) {
        console.error('✗ Fehler beim Erstellen des Mail-Transporters:', error.message);
    }
} else {
    console.warn('⚠ Mail-Transporter NICHT erstellt:');
    console.warn('  - SMTP_USER vorhanden:', !!SMTP_CONFIG.auth.user);
    console.warn('  - SMTP_PASS vorhanden:', !!SMTP_CONFIG.auth.pass);
}

// Datenbankpfad aus Umgebungsvariable oder Standardwert
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'einsatzdoku.db');

// PDF-Speicherort (jetzt im /config Verzeichnis, gemountet vom Host)
const pdfPath = process.env.PDF_PATH || path.join(__dirname, 'data', 'pdfs');

console.log('PDF-Speicherort:', pdfPath);

// Sicherstellen, dass das Datenverzeichnis existiert
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Sicherstellen, dass das PDF-Verzeichnis existiert
if (!fs.existsSync(pdfPath)) {
    fs.mkdirSync(pdfPath, { recursive: true });
    console.log(`PDF-Verzeichnis erstellt: ${pdfPath}`);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log(`Connected to the SQLite database at: ${dbPath}`);
        // Setup tables if they do not exist
        db.serialize(() => {
            // Tabelle für Einsätze
            db.run(`CREATE TABLE IF NOT EXISTS einsaetze (
                einsatznummer TEXT PRIMARY KEY,
                einsatzstelle TEXT,
                einsatzleiter TEXT,
                datum TEXT,
                uhrzeit TEXT,
                alarmstichwort TEXT,
                pa_anzahl INTEGER,
                pa_zeit TEXT,
                bemerkung TEXT,
                bericht TEXT,
                version INTEGER,
                erstellDatum TEXT,
                unterschrift_data TEXT,
                pa_nachweis_datum TEXT,
                pa_nachweis_uhrzeit TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            // Hinzufügen fehlender Spalten für ältere Datenbanken (Schema-Migration)
            db.run(`ALTER TABLE einsaetze ADD COLUMN version INTEGER DEFAULT 1`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Fehler beim Hinzufügen der Spalte "version":', err.message);
                }
            });

            db.run(`ALTER TABLE einsaetze ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Fehler beim Hinzufügen der Spalte "created_at":', err.message);
                }
            });

            // Neue Spalte für Alarmstichwort
            db.run(`ALTER TABLE einsaetze ADD COLUMN alarmstichwort TEXT DEFAULT ''`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Fehler beim Hinzufügen der Spalte "alarmstichwort":', err.message);
                }
            });

            // Tabelle für Besatzungen
            db.run(`CREATE TABLE IF NOT EXISTS besatzungen (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                einsatznummer TEXT,
                fahrzeug TEXT,
                position TEXT,
                name TEXT,
                signature TEXT,
                pa INTEGER,
                pa_minuten INTEGER,
                FOREIGN KEY (einsatznummer) REFERENCES einsaetze(einsatznummer) ON DELETE CASCADE
            )`);

            // Neue Tabelle für Fahrzeuge (mit Bereitstellung)
            db.run(`CREATE TABLE IF NOT EXISTS fahrzeuge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                einsatznummer TEXT,
                fahrzeug TEXT,
                name TEXT,
                bereitstellung INTEGER DEFAULT 0,
                FOREIGN KEY (einsatznummer) REFERENCES einsaetze(einsatznummer) ON DELETE CASCADE
            )`);

            // Neue Tabelle für gespeicherte PDFs
            db.run(`CREATE TABLE IF NOT EXISTS pdfs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                einsatznummer TEXT,
                version INTEGER,
                filename TEXT,
                filepath TEXT,
                created_by TEXT,
                email_sent INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (einsatznummer) REFERENCES einsaetze(einsatznummer) ON DELETE CASCADE
            )`);

            // Tabelle für Anwesenheitslisten
            db.run(`CREATE TABLE IF NOT EXISTS anwesenheitslisten (
                id TEXT PRIMARY KEY,
                datum TEXT NOT NULL,
                thema TEXT,
                dienstleiter TEXT,
                teilnehmer TEXT,
                erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
        });
    }
});

// === HILFSFUNKTIONEN ===

// Liste der Namen laden (aus Environment)
const getNamenListe = () => {
    const namen = NAMEN_ENV.split(',').map(n => n.trim()).filter(n => n);
    console.log(`Namen geladen aus Environment (${namen.length} Einträge).`);
    return namen.sort((a, b) => a.localeCompare(b));
};

// ========================================
// PDF-GENERATOR-FUNKTION - Kompakt & Optimiert
// Zeigt Unterschriften und PA-Zeiten an
// ========================================

const generatePDFContent = (doc, einsatzData) => {
    // A4 Landscape Setup
    doc.switchToPage(0);
    
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 25;
    
    // HEADER mit Logo
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Freiwillige', margin, margin);
    doc.text('FEUERWEHR FRECHEN', margin, margin + 12);
    doc.fontSize(7).font('Helvetica-Oblique');
    doc.text('Schnell-Kompetent-Sicher', margin, margin + 24);
    
    // Titel zentriert
    doc.fontSize(13).font('Helvetica-Bold');
    const title = 'Anwesenheitsliste Einsatz LZ Frechen';
    const titleWidth = doc.widthOfString(title);
    doc.text(title, (pageWidth - titleWidth) / 2, margin + 3);
    
    // === EINSATZINFORMATIONEN ===
    let yPos = margin + 42;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Einsatznummer:', margin, yPos);
    doc.font('Helvetica').text(normalizePDFText(einsatzData.einsatznummer), margin + 80, yPos);

    yPos += 12;
    doc.font('Helvetica-Bold').text('Datum:', margin, yPos);
    doc.font('Helvetica').text(einsatzData.datum || '', margin + 80, yPos);
    doc.font('Helvetica-Bold').text('Uhrzeit:', margin + 220, yPos);
    doc.font('Helvetica').text(einsatzData.uhrzeit || '', margin + 260, yPos);

    yPos += 12;
    doc.font('Helvetica-Bold').text('Einsatzstelle:', margin, yPos);
    doc.font('Helvetica').text(normalizePDFText(einsatzData.einsatzstelle), margin + 80, yPos, { width: 600 });

    yPos += 12;
    doc.font('Helvetica-Bold').text('Einsatzleiter:', margin, yPos);
    doc.font('Helvetica').text(normalizePDFText(einsatzData.einsatzleiter) || '-', margin + 80, yPos);
    
    yPos += 20;

    // Verwende globale Mappings aus der .env-Konfiguration
    const fahrzeugMapping = VEHICLE_CONFIG.fahrzeugMapping;
    
    // === NUR AKTIVE FAHRZEUGE (mit mindestens einem Namen) ===
    const fahrzeugeBesatzungen = {};
    einsatzData.besatzungen.forEach(b => {
        if (!fahrzeugeBesatzungen[b.fahrzeug]) {
            fahrzeugeBesatzungen[b.fahrzeug] = [];
        }
        fahrzeugeBesatzungen[b.fahrzeug].push(b);
    });
    
    // Filter: Nur Fahrzeuge mit mindestens einem Namen
    const aktiveFahrzeuge = Object.keys(fahrzeugeBesatzungen).filter(key => {
        return fahrzeugeBesatzungen[key].some(b => b.name && b.name.trim() !== '');
    });
    
    if (aktiveFahrzeuge.length === 0) {
        doc.fontSize(9).font('Helvetica').fillColor('#666');
        doc.text('Keine Fahrzeuge mit Besatzung vorhanden.', margin, yPos);
        return;
    }
    
    // === DYNAMISCHES GRID: Von links nach rechts, dann nach unten ===
    const boxWidth = (pageWidth - 3 * margin) / 2;
    const boxHeight = 125;
    let xPos = margin;
    let boxYPos = yPos;
    let column = 0;
    
    aktiveFahrzeuge.forEach((fahrzeugKey) => {
        const besatzung = fahrzeugeBesatzungen[fahrzeugKey];
        const fahrzeugName = fahrzeugMapping[fahrzeugKey] || fahrzeugKey.toUpperCase();
        
        // Prüfe ob neue Seite nötig
        if (boxYPos + boxHeight > pageHeight - 40) {
            doc.addPage({ size: 'A4', layout: 'landscape' });
            boxYPos = margin;
            xPos = margin;
            column = 0;
        }
        
        // Fahrzeug-Box Header
        doc.rect(xPos, boxYPos, boxWidth, 18).fillAndStroke('#f0f0f0', '#000');
        doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
        doc.text(fahrzeugName, xPos + 4, boxYPos + 5);
        
        // Checkboxen
        const checkX = xPos + boxWidth - 140;
        doc.fontSize(7).font('Helvetica');
        
        // "ausgerückt" (immer angekreuzt)
        doc.rect(checkX, boxYPos + 4, 9, 9).stroke();
        doc.rect(checkX + 2, boxYPos + 6, 5, 5).fill('#000');
        doc.fillColor('#000').text('ausgerückt:', checkX + 12, boxYPos + 4);
        
        // "Bereitstellung"
        doc.rect(checkX + 65, boxYPos + 4, 9, 9).stroke();
        doc.fillColor('#000').text('Bereitstellung:', checkX + 77, boxYPos + 4);
        
        // Tabelle
        const tableY = boxYPos + 18;
        const rowHeight = 13;
        const colWidths = [boxWidth * 0.18, boxWidth * 0.28, boxWidth * 0.42, boxWidth * 0.12];
        
        // Header
        doc.rect(xPos, tableY, boxWidth, rowHeight).fillAndStroke('#e0e0e0', '#000');
        doc.fillColor('#000').fontSize(7).font('Helvetica-Bold');
        doc.text('Funktion', xPos + 2, tableY + 3, { width: colWidths[0] - 4 });
        doc.text('Name', xPos + colWidths[0] + 2, tableY + 3, { width: colWidths[1] - 4 });
        doc.text('Unterschrift', xPos + colWidths[0] + colWidths[1] + 2, tableY + 3, { width: colWidths[2] - 4 });
        doc.text('PA (Min)', xPos + colWidths[0] + colWidths[1] + colWidths[2] + 2, tableY + 3, { width: colWidths[3] - 4, align: 'center' });
        
        // Zeilen (nur mit Namen)
        const besatzungMitNamen = besatzung.filter(b => b.name && b.name.trim() !== '');
        
        for (let i = 0; i < besatzungMitNamen.length; i++) {
            const b = besatzungMitNamen[i];
            const rowY = tableY + rowHeight + (i * rowHeight);
            
            // Zeile
            doc.rect(xPos, rowY, boxWidth, rowHeight).stroke();
            
            // Spalten-Trennlinien
            let colX = xPos;
            for (let c = 0; c < 3; c++) {
                colX += colWidths[c];
                doc.moveTo(colX, rowY).lineTo(colX, rowY + rowHeight).stroke();
            }
            
            // Funktion
            const funktion = funktionsMapping[b.position] || b.position;
            doc.fontSize(7).font('Helvetica-Bold').fillColor('#000');
            doc.text(funktion, xPos + 2, rowY + 3, { width: colWidths[0] - 4 });
            
            // Name (KOPIERBAR! - mit UTF-8 Normalisierung)
            doc.font('Helvetica').fillColor('#000');
            doc.text(normalizePDFText(b.name), xPos + colWidths[0] + 2, rowY + 3, { width: colWidths[1] - 4 });
            
            // Unterschrift anzeigen (falls vorhanden)
            if (b.signature && b.signature.trim() !== '') {
                try {
                    const signX = xPos + colWidths[0] + colWidths[1] + 2;
                    const signY = rowY + 1;
                    const signWidth = colWidths[2] - 4;
                    const signHeight = rowHeight - 2;
                    doc.image(b.signature, signX, signY, { 
                        fit: [signWidth, signHeight],
                        align: 'center',
                        valign: 'center'
                    });
                } catch (e) {
                    console.error('Fehler beim Einfügen der Unterschrift:', e);
                }
            }
            
            // PA Zeit anzeigen (falls vorhanden)
            if (b.pa && b.paMinuten) {
                doc.font('Helvetica').fontSize(7).fillColor('#000');
                const paText = b.paMinuten.toString();
                const paX = xPos + colWidths[0] + colWidths[1] + colWidths[2];
                doc.text(paText, paX + 2, rowY + 3, { width: colWidths[3] - 4, align: 'center' });
            }
        }
        
        // Nächste Position: Links nach rechts, dann nach unten
        column++;
        if (column % 2 === 0) {
            xPos = margin;
            boxYPos += boxHeight + 12;
        } else {
            xPos += boxWidth + margin;
        }
    });
};

module.exports = { generatePDFContent };

// Generiere PDF (komplette Logik beibehalten)
const generatePDF = (einsatzData, res) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });

    if (res) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Einsatzdoku_${einsatzData.einsatznummer}_V${einsatzData.version}.pdf"`);
        doc.pipe(res);
    }

    generatePDFContent(doc, einsatzData);
    doc.end();
};

// Helper function: Normalize text for PDF (UTF-8 compatibility)
function normalizePDFText(text) {
    if (!text) return '';
    // Normalize to NFC (canonical composition) for better PDF compatibility
    return String(text).normalize('NFC');
}

// Add a simple table method to PDFDocument
PDFDocument.prototype.table = function (table, options) {
    let self = this;
    const itemHeight = 20;
    const startY = self.y;
    const startX = self.x;
    const colCount = table.headers.length;
    const colWidth = options.width / colCount;

    self.font('Helvetica-Bold').fontSize(9).fillColor('#003049');
    table.headers.forEach((header, i) => {
        self.text(header, startX + i * colWidth, startY + 5, { width: colWidth - 5 });
    });
    self.rect(startX, startY, options.width, itemHeight).stroke();
    self.y += itemHeight;

    self.font('Helvetica').fillColor('black');
    table.rows.forEach((row, rowIndex) => {
        const rowY = self.y;
        row.forEach((cell, cellIndex) => {
            self.text(cell, startX + cellIndex * colWidth, rowY + 5, { width: colWidth - 5 });
        });
        self.rect(startX, rowY, options.width, itemHeight).stroke();
        self.y += itemHeight;
    });

    return self;
};

// === API ENDPOINTS ===

// Einsatzdaten abrufen (GET) - EINHEITLICHE STRUKTUR
app.get('/api/einsatz/:einsatznummer', (req, res) => {
    const { einsatznummer } = req.params;

    db.get('SELECT * FROM einsaetze WHERE einsatznummer = ?', [einsatznummer], (err, einsatzRow) => {
        if (err) {
            console.error(`DB Error fetching Einsatz ${einsatznummer}:`, err.message);
            return res.status(500).json({ error: err.message });
        }
        if (!einsatzRow) {
            return res.status(404).json({ error: 'Einsatz nicht gefunden' });
        }

        // Fahrzeuge laden
        db.all('SELECT fahrzeug, name, bereitstellung FROM fahrzeuge WHERE einsatznummer = ?', [einsatznummer], (err, fahrzeugRows) => {
            if (err) {
                console.error(`DB Error fetching Fahrzeuge for ${einsatznummer}:`, err.message);
                return res.status(500).json({ error: err.message });
            }

            // Besatzungen laden
            db.all('SELECT fahrzeug, position, name, signature, pa, pa_minuten FROM besatzungen WHERE einsatznummer = ?', [einsatznummer], (err, besatzungRows) => {
                if (err) {
                    console.error(`DB Error fetching Besatzungen for ${einsatznummer}:`, err.message);
                    return res.status(500).json({ error: err.message });
                }

                // EINHEITLICHE RESPONSE-STRUKTUR
                const response = {
                    einsatz: {
                        einsatznummer: einsatzRow.einsatznummer,
                        einsatzstelle: einsatzRow.einsatzstelle,
                        einsatzleiter: einsatzRow.einsatzleiter,
                        datum: einsatzRow.datum,
                        uhrzeit: einsatzRow.uhrzeit,
                        alarmstichwort: einsatzRow.alarmstichwort,
                        paAnzahl: einsatzRow.pa_anzahl,
                        paZeit: einsatzRow.pa_zeit,
                        bemerkung: einsatzRow.bemerkung,
                        bericht: einsatzRow.bericht,
                        version: einsatzRow.version,
                        erstellDatum: einsatzRow.erstellDatum,
                        unterschriftData: einsatzRow.unterschrift_data,
                        paNachweisDatum: einsatzRow.pa_nachweis_datum,
                        paNachweisUhrzeit: einsatzRow.pa_nachweis_uhrzeit
                    },
                    fahrzeuge: fahrzeugRows.map(f => ({
                        fahrzeug: f.fahrzeug,
                        name: f.name,
                        bereitstellung: f.bereitstellung === 1
                    })),
                    besatzungen: besatzungRows.map(b => ({
                        fahrzeug: b.fahrzeug,
                        position: b.position,
                        name: b.name,
                        signature: b.signature,
                        pa: b.pa === 1,
                        paMinuten: b.pa_minuten
                    }))
                };

                res.json(response);
            });
        });
    });
});

// Einsatzdaten speichern/updaten (POST)
app.post('/api/einsatz', (req, res) => {
    const { einsatznummer, fahrzeuge, besatzungen, ...einsatzData } = req.body;

    // Input-Validierung (optional - nur wenn Modul geladen)
    if (validation) {
        const einsatznummerCheck = validation.validateEinsatznummer(einsatznummer);
        if (!einsatznummerCheck.valid) {
            return res.status(400).json({ error: einsatznummerCheck.error });
        }

        const datumCheck = validation.validateDatum(einsatzData.datum);
        if (!datumCheck.valid) {
            return res.status(400).json({ error: datumCheck.error });
        }

        const uhrzeitCheck = validation.validateUhrzeit(einsatzData.uhrzeit);
        if (!uhrzeitCheck.valid) {
            return res.status(400).json({ error: uhrzeitCheck.error });
        }

        const einsatzstelleCheck = validation.validateText(einsatzData.einsatzstelle, 'Einsatzstelle', 200);
        if (!einsatzstelleCheck.valid) {
            return res.status(400).json({ error: einsatzstelleCheck.error });
        }
    }

    const dbData = {
        einsatznummer: einsatznummer,
        einsatzstelle: einsatzData.einsatzstelle,
        einsatzleiter: einsatzData.einsatzleiter,
        datum: einsatzData.datum,
        uhrzeit: einsatzData.uhrzeit,
        pa_anzahl: einsatzData.paAnzahl || 0,
        pa_zeit: einsatzData.paZeit || '',
        bemerkung: einsatzData.bemerkung || '',
        bericht: einsatzData.bericht || '',
        version: einsatzData.version || 1,
        erstellDatum: einsatzData.erstellDatum || new Date().toISOString().split('T')[0],
        unterschrift_data: einsatzData.unterschriftData || '',
        pa_nachweis_datum: einsatzData.paNachweisDatum || '',
        pa_nachweis_uhrzeit: einsatzData.paNachweisUhrzeit || ''
    };

    db.serialize(() => {
        // Insert/Update Einsatz
        db.run(`INSERT INTO einsaetze 
            (einsatznummer, einsatzstelle, einsatzleiter, datum, uhrzeit, pa_anzahl, pa_zeit, bemerkung, bericht, version, erstellDatum, unterschrift_data, pa_nachweis_datum, pa_nachweis_uhrzeit) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
            ON CONFLICT(einsatznummer) DO UPDATE SET 
            einsatzstelle=excluded.einsatzstelle, einsatzleiter=excluded.einsatzleiter, datum=excluded.datum, uhrzeit=excluded.uhrzeit, 
            pa_anzahl=excluded.pa_anzahl, pa_zeit=excluded.pa_zeit, bemerkung=excluded.bemerkung, bericht=excluded.bericht, version=excluded.version, erstellDatum=excluded.erstellDatum, 
            unterschrift_data=excluded.unterschrift_data, pa_nachweis_datum=excluded.pa_nachweis_datum, pa_nachweis_uhrzeit=excluded.pa_nachweis_uhrzeit`,
            Object.values(dbData),
            function(err) {
                if (err) {
                    console.error('Error saving einsatz:', err);
                    return res.status(500).json({ error: err.message });
                }

                // Delete old fahrzeuge
                db.run('DELETE FROM fahrzeuge WHERE einsatznummer = ?', [einsatznummer], (err) => {
                    if (err) {
                        console.error('Error deleting fahrzeuge:', err);
                        return res.status(500).json({ error: err.message });
                    }

                    // Insert new fahrzeuge
                    if (fahrzeuge && fahrzeuge.length > 0) {
                        const stmtFahrzeuge = db.prepare('INSERT INTO fahrzeuge (einsatznummer, fahrzeug, name, bereitstellung) VALUES (?, ?, ?, ?)');
                        fahrzeuge.forEach(f => {
                            stmtFahrzeuge.run(einsatznummer, f.fahrzeug, f.name, f.bereitstellung ? 1 : 0);
                        });
                        stmtFahrzeuge.finalize();
                    }

                    // Delete old besatzungen
                    db.run('DELETE FROM besatzungen WHERE einsatznummer = ?', [einsatznummer], (err) => {
                        if (err) {
                            console.error('Error deleting besatzungen:', err);
                            return res.status(500).json({ error: err.message });
                        }

                        // Insert new besatzungen
                        if (besatzungen && besatzungen.length > 0) {
                            const stmtBesatzungen = db.prepare('INSERT INTO besatzungen (einsatznummer, fahrzeug, position, name, signature, pa, pa_minuten) VALUES (?, ?, ?, ?, ?, ?, ?)');
                            besatzungen.forEach(b => {
                                stmtBesatzungen.run(einsatznummer, b.fahrzeug, b.position, b.name, b.signature, b.pa ? 1 : 0, b.paMinuten || 0);
                            });
                            stmtBesatzungen.finalize(() => {
                                res.json({ message: 'Einsatz erfolgreich gespeichert', einsatznummer });
                            });
                        } else {
                            res.json({ message: 'Einsatz erfolgreich gespeichert', einsatznummer });
                        }
                    });
                });
            }
        );
    });
});

// Einsatzdaten updaten (PUT) - für Kompatibilität
app.put('/api/einsatz/:einsatznummer', (req, res) => {
    req.body.einsatznummer = req.params.einsatznummer;
    // Verwende den POST-Handler
    app._router.handle(Object.assign({}, req, { method: 'POST', url: '/api/einsatz' }), res);
});

// Einsatzdokumentation als PDF abrufen/downloaden (DIREKTER DOWNLOAD)
app.get('/api/pdf/download/:einsatznummer', (req, res) => {
    const { einsatznummer } = req.params;

    db.get('SELECT * FROM einsaetze WHERE einsatznummer = ?', [einsatznummer], (err, einsatzRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!einsatzRow) return res.status(404).json({ error: 'Einsatz nicht gefunden' });

        db.all('SELECT fahrzeug, position, name, signature, pa, pa_minuten FROM besatzungen WHERE einsatznummer = ?', [einsatznummer], (err, besatzungRows) => {
            if (err) return res.status(500).json({ error: err.message });

            const einsatzData = {
                einsatznummer: einsatzRow.einsatznummer,
                einsatzstelle: einsatzRow.einsatzstelle,
                einsatzleiter: einsatzRow.einsatzleiter,
                datum: einsatzRow.datum,
                uhrzeit: einsatzRow.uhrzeit,
                alarmstichwort: einsatzRow.alarmstichwort,
                pa_anzahl: einsatzRow.pa_anzahl,
                pa_zeit: einsatzRow.pa_zeit,
                bemerkung: einsatzRow.bemerkung,
                bericht: einsatzRow.bericht,
                version: einsatzRow.version || 1,
                erstellDatum: einsatzRow.erstellDatum,
                unterschrift_data: einsatzRow.unterschrift_data,
                pa_nachweis_datum: einsatzRow.pa_nachweis_datum,
                pa_nachweis_uhrzeit: einsatzRow.pa_nachweis_uhrzeit,
                besatzungen: besatzungRows.map(b => ({
                    fahrzeug: b.fahrzeug,
                    position: b.position,
                    name: b.name,
                    signature: b.signature,
                    pa: b.pa === 1,
                    paMinuten: b.pa_minuten
                }))
            };

            generatePDF(einsatzData, res);
        });
    });
});

// PDF generieren und auf Server speichern
app.post('/api/pdf/generate/:einsatznummer', (req, res) => {
    const { einsatznummer } = req.params;
    const { createdBy } = req.body;

    // Einsatz laden
    db.get('SELECT * FROM einsaetze WHERE einsatznummer = ?', [einsatznummer], (err, einsatzRow) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!einsatzRow) return res.status(404).json({ error: 'Einsatz nicht gefunden' });

        // Besatzungen laden
        db.all('SELECT fahrzeug, position, name, signature, pa, pa_minuten FROM besatzungen WHERE einsatznummer = ?', [einsatznummer], (err, besatzungRows) => {
            if (err) return res.status(500).json({ error: err.message });

            // Höchste Version ermitteln
            db.get('SELECT MAX(version) as maxVersion FROM pdfs WHERE einsatznummer = ?', [einsatznummer], (err, versionRow) => {
                if (err) return res.status(500).json({ error: err.message });

                const newVersion = (versionRow.maxVersion || 0) + 1;
                const filename = `${einsatznummer}_V${newVersion}.pdf`;
                
                // Ordner für Einsatznummer erstellen
                const einsatzDir = path.join(pdfPath, einsatznummer);
                if (!fs.existsSync(einsatzDir)) {
                    fs.mkdirSync(einsatzDir, { recursive: true });
                }
                
                const filepath = path.join(einsatzDir, filename);

                // PDF-Daten vorbereiten
                const einsatzData = {
                    einsatznummer: einsatzRow.einsatznummer,
                    einsatzstelle: einsatzRow.einsatzstelle,
                    einsatzleiter: einsatzRow.einsatzleiter,
                    datum: einsatzRow.datum,
                    uhrzeit: einsatzRow.uhrzeit,
                    alarmstichwort: einsatzRow.alarmstichwort,
                    pa_anzahl: einsatzRow.pa_anzahl,
                    pa_zeit: einsatzRow.pa_zeit,
                    bemerkung: einsatzRow.bemerkung,
                    bericht: einsatzRow.bericht,
                    version: newVersion,
                    erstellDatum: new Date().toISOString().split('T')[0],
                    unterschrift_data: einsatzRow.unterschrift_data,
                    pa_nachweis_datum: einsatzRow.pa_nachweis_datum,
                    pa_nachweis_uhrzeit: einsatzRow.pa_nachweis_uhrzeit,
                    besatzungen: besatzungRows.map(b => ({
                        fahrzeug: b.fahrzeug,
                        position: b.position,
                        name: b.name,
                        signature: b.signature,
                        pa: b.pa === 1,
                        paMinuten: b.pa_minuten
                    }))
                };

                // PDF in Datei schreiben
                const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
                const writeStream = fs.createWriteStream(filepath);
                
                doc.pipe(writeStream);
                generatePDFContent(doc, einsatzData);
                doc.end();

                writeStream.on('finish', () => {
                    // In Datenbank eintragen
                    db.run(
                        'INSERT INTO pdfs (einsatznummer, version, filename, filepath, created_by) VALUES (?, ?, ?, ?, ?)',
                        [einsatznummer, newVersion, filename, filepath, createdBy || 'System'],
                        function(err) {
                            if (err) return res.status(500).json({ error: err.message });
                            
                            res.json({
                                message: 'PDF erfolgreich erstellt und gespeichert',
                                id: this.lastID,
                                version: newVersion,
                                filename: filename,
                                einsatznummer: einsatznummer
                            });
                        }
                    );
                });

                writeStream.on('error', (err) => {
                    console.error('Fehler beim Schreiben der PDF:', err);
                    res.status(500).json({ error: 'Fehler beim Speichern der PDF' });
                });
            });
        });
    });
});

// Liste aller gespeicherten PDFs für einen Einsatz
app.get('/api/pdf/list/:einsatznummer', (req, res) => {
    const { einsatznummer } = req.params;
    
    db.all(
        'SELECT id, version, filename, created_by, email_sent, created_at FROM pdfs WHERE einsatznummer = ? ORDER BY version DESC',
        [einsatznummer],
        (err, rows) => {
            if (err) {
                console.error('Fehler beim Laden der PDF-Liste:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

// Gespeicherte PDF vom Server herunterladen
app.get('/api/pdf/file/:id', (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM pdfs WHERE id = ?', [id], (err, pdf) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!pdf) return res.status(404).json({ error: 'PDF nicht gefunden' });
        
        const filepath = pdf.filepath;
        
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'PDF-Datei existiert nicht auf dem Server' });
        }
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
        
        const fileStream = fs.createReadStream(filepath);
        fileStream.pipe(res);
        
        fileStream.on('error', (err) => {
            console.error('Fehler beim Lesen der PDF:', err);
            res.status(500).json({ error: 'Fehler beim Lesen der PDF' });
        });
    });
});

// PDF löschen
app.delete('/api/pdf/:id', (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    // Passwort prüfen
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    if (passwordHash !== DELETE_PASSWORD_HASH) {
        return res.status(403).json({ error: 'Falsches Passwort' });
    }
    
    db.get('SELECT * FROM pdfs WHERE id = ?', [id], (err, pdf) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!pdf) return res.status(404).json({ error: 'PDF nicht gefunden' });
        
        // Datei vom Server löschen
        if (fs.existsSync(pdf.filepath)) {
            try {
                fs.unlinkSync(pdf.filepath);
            } catch (err) {
                console.error('Fehler beim Löschen der Datei:', err);
            }
        }
        
        // Aus Datenbank löschen
        db.run('DELETE FROM pdfs WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'PDF erfolgreich gelöscht' });
        });
    });
});

// E-Mail-Versand der PDF (automatisch an konfigurierte Empfänger)
app.post('/api/pdf/email', async (req, res) => {
    console.log('[EMAIL] ===== E-Mail-Anfrage gestartet =====');
    console.log('[EMAIL] Request Body:', JSON.stringify(req.body, null, 2));
    
    if (!mailTransporter) {
        console.error('[EMAIL] FEHLER: E-Mail-Dienst nicht konfiguriert');
        console.error('[EMAIL] SMTP_USER:', SMTP_CONFIG.auth.user);
        console.error('[EMAIL] SMTP_HOST:', SMTP_CONFIG.host);
        return res.status(500).json({ error: 'E-Mail-Dienst nicht konfiguriert. Prüfen Sie die SMTP-Einstellungen.' });
    }
    
    if (!EMAIL_RECIPIENTS_BERICHT) {
        console.error('[EMAIL] FEHLER: Keine Empfänger konfiguriert');
        return res.status(500).json({ error: 'Keine E-Mail-Empfänger konfiguriert. Bitte EMAIL_RECIPIENTS_BERICHT in .env setzen.' });
    }

    // Prüfe auf Platzhalter-Adressen
    if (EMAIL_RECIPIENTS_BERICHT.includes('example.com')) {
        console.error('[EMAIL] FEHLER: EMAIL_RECIPIENTS_BERICHT enthält Platzhalter-Adressen!');
        console.error('[EMAIL] Aktuelle Empfänger:', EMAIL_RECIPIENTS_BERICHT);
        return res.status(500).json({ error: 'E-Mail-Empfänger sind nicht korrekt konfiguriert. Bitte echte E-Mail-Adressen in .env.smtp eintragen.' });
    }

    const { pdfId } = req.body;
    console.log('[EMAIL] PDF-ID:', pdfId);

    db.get('SELECT * FROM pdfs WHERE id = ?', [pdfId], async (err, pdf) => {
        if (err) {
            console.error('[EMAIL] Datenbankfehler:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!pdf) {
            console.error('[EMAIL] PDF nicht gefunden:', pdfId);
            return res.status(404).json({ error: 'PDF nicht gefunden' });
        }
        
        console.log('[EMAIL] PDF gefunden:', pdf.filename);
        
        // Prüfe ob bereits versendet
        if (pdf.email_sent === 1) {
            console.warn('[EMAIL] PDF bereits versendet');
            return res.status(400).json({ error: 'Diese PDF wurde bereits per E-Mail versendet.' });
        }
        
        if (!fs.existsSync(pdf.filepath)) {
            console.error('[EMAIL] PDF-Datei nicht gefunden:', pdf.filepath);
            return res.status(404).json({ error: 'PDF-Datei existiert nicht auf dem Server' });
        }
        
        // Hole Einsatznummer für E-Mail-Text
        const einsatznummer = pdf.einsatznummer;
        const recipients = EMAIL_RECIPIENTS_BERICHT.split(',').map(e => e.trim());
        
        console.log('[EMAIL] Empfänger:', recipients);
        
        const subject = `Neuer Einsatzbericht - ${einsatznummer}`;
        const message = `Guten Tag,\n\nEin neuer Einsatz Bericht mit der Einsatznummer ${einsatznummer} wurde geschrieben.\nBei Fragen wenden Sie sich bitte an support@feuerwehr-frechen.de\n\nMit freundlichen Grüßen\nFeuerwehr Frechen`;

        try {
            console.log('[EMAIL] Sende E-Mail...');
            console.log('[EMAIL] Von:', SMTP_CONFIG.auth.user);
            console.log('[EMAIL] An:', recipients.join(','));
            console.log('[EMAIL] Betreff:', subject);
            console.log('[EMAIL] Anhang:', pdf.filename);
            console.log('[EMAIL] Dateipfad:', pdf.filepath);
            
            const mailOptions = {
                from: SMTP_CONFIG.auth.user,
                to: recipients.join(','),
                subject: subject,
                text: message,
                attachments: [
                    {
                        filename: pdf.filename,
                        path: pdf.filepath
                    }
                ]
            };
            
            console.log('[EMAIL] Mail-Optionen:', JSON.stringify({
                from: mailOptions.from,
                to: mailOptions.to,
                subject: mailOptions.subject,
                attachmentCount: mailOptions.attachments.length
            }, null, 2));
            
            const info = await mailTransporter.sendMail(mailOptions);
            
            console.log('[EMAIL] ✓ E-Mail erfolgreich versendet!');
            console.log('[EMAIL] Message ID:', info.messageId);
            console.log('[EMAIL] Response:', info.response);
            
            // Markiere als versendet
            db.run('UPDATE pdfs SET email_sent = 1 WHERE id = ?', [pdfId], (err) => {
                if (err) {
                    console.error('[EMAIL] Fehler beim Markieren der PDF:', err);
                } else {
                    console.log('[EMAIL] PDF als versendet markiert');
                }
            });
            
            res.json({ 
                message: 'E-Mail erfolgreich versendet',
                recipients: recipients.length,
                messageId: info.messageId
            });
        } catch (error) {
            console.error('[EMAIL] ===== FEHLER beim E-Mail-Versand =====');
            console.error('[EMAIL] Error Name:', error.name);
            console.error('[EMAIL] Error Message:', error.message);
            console.error('[EMAIL] Error Code:', error.code);
            console.error('[EMAIL] Error Command:', error.command);
            console.error('[EMAIL] Stack:', error.stack);
            res.status(500).json({ 
                error: 'Fehler beim E-Mail-Versand: ' + error.message,
                details: error.code || 'Unbekannter Fehler'
            });
        }
    });
});

// Letzte Einsätze
app.get('/api/einsaetze/recent', (req, res) => {
    db.all(
        'SELECT einsatznummer, einsatzstelle, einsatzleiter, datum, uhrzeit, version FROM einsaetze ORDER BY created_at DESC LIMIT 5',
        (err, rows) => {
            if (err) {
                console.error('DB Error fetching recent einsaetze:', err.message);
                return res.status(500).json({ error: 'DB Fehler beim Abrufen der letzten Einsätze: ' + err.message });
            }
            res.json(rows);
        }
    );
});

// Namen API
app.get('/api/namen', (req, res) => {
    const namen = getNamenListe();

    if (namen.length === 0) {
        return res.status(404).json({ error: 'Keine Namen gefunden. Überprüfen Sie NAMEN_ENV oder namen.txt.' });
    }

    res.json({
        namen: namen,
        stand: NAMENSLISTE_STAND
    });
});

// Fahrzeug-Konfiguration API
app.get('/api/fahrzeuge', (req, res) => {
    res.json({
        vehicles: VEHICLE_CONFIG.vehicles,
        funktionsMapping: funktionsMapping
    });
});

// Anwesenheitsliste speichern
app.post('/api/anwesenheit', (req, res) => {
    const { datum, thema, dienstleiter, teilnehmer } = req.body;

    if (!datum) {
        return res.status(400).json({ error: 'Datum ist erforderlich.' });
    }

    const id = `anwesenheit-${Date.now()}`;
    const data = {
        id,
        datum,
        thema,
        dienstleiter,
        teilnehmer,
        erstellt_am: new Date().toISOString()
    };

    // Save to database
    const stmt = db.prepare(`
        INSERT INTO anwesenheitslisten (id, datum, thema, dienstleiter, teilnehmer, erstellt_am)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        id,
        datum,
        thema || '',
        dienstleiter || '',
        JSON.stringify(teilnehmer || []),
        data.erstellt_am,
        function(err) {
            if (err) {
                console.error('Fehler beim Speichern der Anwesenheitsliste:', err);
                return res.status(500).json({ error: 'Fehler beim Speichern der Anwesenheitsliste.' });
            }
            res.json({ success: true, id: id });
        }
    );
});

// Auto-save draft (upsert with fixed ID 'draft' or 'draft-sonder')
app.post('/api/anwesenheit/draft', (req, res) => {
    const { datum, thema, dienstleiter, teilnehmer, type } = req.body;

    // Determine draft ID based on type
    const draftId = type === 'sonder' ? 'draft-sonder' : 'draft-dienste';

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO anwesenheitslisten (id, datum, thema, dienstleiter, teilnehmer, erstellt_am)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(
        draftId,
        datum || '',
        thema || '',
        dienstleiter || '',
        JSON.stringify(teilnehmer || []),
        function(err) {
            if (err) {
                console.error('Fehler beim Auto-Speichern:', err);
                return res.status(500).json({ error: 'Fehler beim Auto-Speichern.' });
            }
            res.json({ success: true });
        }
    );
});

// Get draft
app.get('/api/anwesenheit/draft', (req, res) => {
    const type = req.query.type;
    const draftId = type === 'sonder' ? 'draft-sonder' : 'draft-dienste';

    db.get('SELECT * FROM anwesenheitslisten WHERE id = ?', [draftId], (err, row) => {
        if (err) {
            console.error('Fehler beim Laden des Entwurfs:', err);
            return res.status(500).json({ error: 'Fehler beim Laden des Entwurfs.' });
        }

        if (!row) {
            return res.json({ draft: null });
        }

        res.json({
            draft: {
                datum: row.datum,
                thema: row.thema,
                dienstleiter: row.dienstleiter,
                teilnehmer: JSON.parse(row.teilnehmer || '[]')
            }
        });
    });
});

// Delete draft
app.delete('/api/anwesenheit/draft', (req, res) => {
    const type = req.query.type;
    const draftId = type === 'sonder' ? 'draft-sonder' : 'draft-dienste';

    db.run('DELETE FROM anwesenheitslisten WHERE id = ?', [draftId], function(err) {
        if (err) {
            console.error('Fehler beim Löschen des Entwurfs:', err);
            return res.status(500).json({ error: 'Fehler beim Löschen des Entwurfs.' });
        }
        res.json({ success: true });
    });
});

// Anwesenheitsliste PDF generieren
app.post('/api/anwesenheit/pdf', async (req, res) => {
    const { datum, thema, dienstleiter, teilnehmer } = req.body;

    if (!datum) {
        return res.status(400).json({ error: 'Datum ist erforderlich.' });
    }

    try {
        // Create PDF
        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Anwesenheitsliste_${datum}.pdf`);

        // Pipe PDF to response
        doc.pipe(res);

        // Header
        doc.fontSize(18).font('Helvetica-Bold').text('Anwesenheitsliste Dienst LZ Frechen', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Stand ${new Date().toLocaleDateString('de-DE')}`, { align: 'right' });
        doc.moveDown(1);

        // Info section
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(`Datum: ${datum}`, 50, doc.y);
        doc.text(`Thema: ${normalizePDFText(thema)}`, 300, doc.y - 15);
        doc.moveDown(0.5);
        doc.text(`Dienstleiter: ${normalizePDFText(dienstleiter)}`, 50, doc.y);
        doc.moveDown(1.5);

        // Table header
        const tableTop = doc.y;
        const colWidths = { nr: 35, name: 160, anwesend: 60, nichtAnwesend: 80, entschuldigt: 80, bemerkung: 130 };
        const totalWidth = colWidths.nr + colWidths.name + colWidths.anwesend + colWidths.nichtAnwesend + colWidths.entschuldigt + colWidths.bemerkung;
        let xPos = 50;

        doc.fontSize(9).font('Helvetica-Bold');
        doc.rect(xPos, tableTop, totalWidth, 25).fill('#003049');

        doc.fillColor('white');
        doc.text('Nr.', xPos + 5, tableTop + 8, { width: colWidths.nr - 10, align: 'center' });
        xPos += colWidths.nr;
        doc.text('Name', xPos + 5, tableTop + 8, { width: colWidths.name - 10 });
        xPos += colWidths.name;
        doc.text('anwesend', xPos + 5, tableTop + 8, { width: colWidths.anwesend - 10, align: 'center' });
        xPos += colWidths.anwesend;
        doc.text('nicht\nanwesend', xPos + 5, tableTop + 4, { width: colWidths.nichtAnwesend - 10, align: 'center' });
        xPos += colWidths.nichtAnwesend;
        doc.text('entschuldigt', xPos + 5, tableTop + 8, { width: colWidths.entschuldigt - 10, align: 'center' });
        xPos += colWidths.entschuldigt;
        doc.text('Bemerkung / Info', xPos + 5, tableTop + 8, { width: colWidths.bemerkung - 10 });

        doc.fillColor('black');
        let yPos = tableTop + 30;

        // Table rows
        doc.font('Helvetica').fontSize(9);
        teilnehmer.forEach((person, index) => {
            if (yPos > 750) {
                doc.addPage();
                yPos = 50;
            }

            xPos = 50;
            const rowHeight = 25;

            // Draw row background (alternating)
            if (index % 2 === 0) {
                doc.rect(xPos, yPos, totalWidth, rowHeight).fill('#f8f9fa');
                doc.fillColor('black');
            }

            // Nr
            doc.text(person.nr, xPos + 5, yPos + 8, { width: colWidths.nr, align: 'center' });
            xPos += colWidths.nr;

            // Name (mit UTF-8 Normalisierung)
            doc.text(normalizePDFText(person.name), xPos + 5, yPos + 8, { width: colWidths.name });
            xPos += colWidths.name;

            // Checkboxes for status - nur für normale Dienste
            if (!isSonder) {
                const checkboxY = yPos + 7;  // Besser zentriert in der Zeile

                // anwesend
                doc.rect(xPos + 25, checkboxY, 10, 10).stroke();
                if (person.status === 'anwesend') {
                    doc.text('X', xPos + 27, checkboxY + 1);
                }
                xPos += colWidths.anwesend;

                // nicht anwesend
                doc.rect(xPos + 15, checkboxY, 10, 10).stroke();
                if (person.status === 'nicht_anwesend') {
                    doc.text('X', xPos + 17, checkboxY + 1);
                }
                xPos += colWidths.nichtAnwesend;

                // entschuldigt
                doc.rect(xPos + 18, checkboxY, 10, 10).stroke();
                if (person.status === 'entschuldigt') {
                    doc.text('X', xPos + 20, checkboxY + 1);
                }
                xPos += colWidths.entschuldigt;
            }

            // Bemerkung (mit UTF-8 Normalisierung)
            doc.text(normalizePDFText(person.bemerkung), xPos + 5, yPos + 8, {
                width: colWidths.bemerkung - 10
            });

            yPos += rowHeight;
        });

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('Fehler beim Generieren des PDFs:', error);
        res.status(500).json({ error: 'Fehler beim Generieren des PDFs.' });
    }
});

// E-Mail-Versand der Anwesenheitsliste
app.post('/api/anwesenheit/email', async (req, res) => {
    console.log('[ANWESENHEIT EMAIL] ===== E-Mail-Anfrage gestartet =====');

    if (!mailTransporter) {
        console.error('[ANWESENHEIT EMAIL] FEHLER: E-Mail-Dienst nicht konfiguriert');
        return res.status(500).json({ error: 'E-Mail-Dienst nicht konfiguriert. Prüfen Sie die SMTP-Einstellungen.' });
    }

    const { datum, thema, dienstleiter, teilnehmer, type } = req.body;

    // Bestimme Email-Empfänger basierend auf dem Typ
    const EMAIL_RECIPIENTS_ANWESENHEIT = process.env.EMAIL_RECIPIENTS_ANWESENHEIT;
    const EMAIL_RECIPIENTS_SONDER = process.env.EMAIL_RECIPIENTS_SONDER;

    let recipients;
    if (type === 'sonder') {
        recipients = EMAIL_RECIPIENTS_SONDER;
        if (!recipients) {
            console.error('[ANWESENHEIT EMAIL] FEHLER: Keine Empfänger für Sonderdienste konfiguriert');
            return res.status(500).json({ error: 'Keine E-Mail-Empfänger konfiguriert. Bitte EMAIL_RECIPIENTS_SONDER in .env setzen.' });
        }
    } else {
        recipients = EMAIL_RECIPIENTS_ANWESENHEIT;
        if (!recipients) {
            console.error('[ANWESENHEIT EMAIL] FEHLER: Keine Empfänger für Anwesenheitslisten konfiguriert');
            return res.status(500).json({ error: 'Keine E-Mail-Empfänger konfiguriert. Bitte EMAIL_RECIPIENTS_ANWESENHEIT in .env setzen.' });
        }
    }

    if (!datum) {
        return res.status(400).json({ error: 'Datum ist erforderlich.' });
    }

    try {
        // Generate PDF in memory
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50
        });
        const chunks = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', async () => {
            try {
                const pdfBuffer = Buffer.concat(chunks);

                // Send email
                const emailSubject = isSonder ? `Sonderdienst vom ${datum}${thema ? ' - ' + thema : ''}` : `Anwesenheitsliste vom ${datum}${thema ? ' - ' + thema : ''}`;
                const emailFilename = isSonder ? `Sonderdienst_${datum}.pdf` : `Anwesenheitsliste_${datum}.pdf`;

                const mailOptions = {
                    from: SMTP_CONFIG.auth.user,
                    to: recipients,
                    subject: emailSubject,
                    text: `Anbei finden Sie ${isSonder ? 'den Sonderdienst' : 'die Anwesenheitsliste'} vom ${datum}.\n\nThema: ${thema || 'Nicht angegeben'}\nDienstleiter: ${dienstleiter || 'Nicht angegeben'}\nTeilnehmer: ${teilnehmer.length}`,
                    attachments: [{
                        filename: emailFilename,
                        content: pdfBuffer
                    }]
                };

                console.log('[ANWESENHEIT EMAIL] Sende E-Mail an:', recipients);

                await mailTransporter.sendMail(mailOptions);

                console.log('[ANWESENHEIT EMAIL] E-Mail erfolgreich versendet');
                res.json({ success: true, message: 'E-Mail erfolgreich versendet' });
            } catch (emailError) {
                console.error('[ANWESENHEIT EMAIL] Fehler beim Versenden:', emailError);
                res.status(500).json({ error: 'Fehler beim Versenden der E-Mail.' });
            }
        });

        // Generate PDF content
        // Header - unterschiedlich je nach Type
        const isSonder = type === 'sonder';
        const title = isSonder ? 'Sonderdienst LZ Frechen' : 'Anwesenheitsliste Dienst LZ Frechen';

        doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Stand ${new Date().toLocaleDateString('de-DE')}`, { align: 'right' });
        doc.moveDown(1);

        // Info section
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(`Datum: ${datum}`, 50, doc.y);
        doc.text(`Thema: ${normalizePDFText(thema)}`, 300, doc.y - 15);
        doc.moveDown(0.5);
        doc.text(`Dienstleiter: ${normalizePDFText(dienstleiter)}`, 50, doc.y);
        doc.moveDown(1.5);

        // Table header - unterschiedlich je nach Type
        const tableTop = doc.y;
        const colWidths = isSonder
            ? { nr: 35, name: 200, bemerkung: 310 }  // Sonderdienst: Keine Anwesenheit-Spalten
            : { nr: 35, name: 160, anwesend: 60, nichtAnwesend: 80, entschuldigt: 80, bemerkung: 130 };  // Normal: Mit Anwesenheit
        let xPos = 50;

        doc.fontSize(9).font('Helvetica-Bold');

        // Berechne Gesamtbreite abhängig vom Type
        const totalWidth = isSonder
            ? colWidths.nr + colWidths.name + colWidths.bemerkung
            : colWidths.nr + colWidths.name + colWidths.anwesend + colWidths.nichtAnwesend + colWidths.entschuldigt + colWidths.bemerkung;

        doc.rect(xPos, tableTop, totalWidth, 25).fill('#003049');

        doc.fillColor('white');
        doc.text('Nr.', xPos + 5, tableTop + 8, { width: colWidths.nr - 10, align: 'center' });
        xPos += colWidths.nr;
        doc.text('Name', xPos + 5, tableTop + 8, { width: colWidths.name - 10 });
        xPos += colWidths.name;

        // Nur für normale Dienste: Anwesenheit-Spalten
        if (!isSonder) {
            doc.text('anwesend', xPos + 5, tableTop + 8, { width: colWidths.anwesend - 10, align: 'center' });
            xPos += colWidths.anwesend;
            doc.text('nicht\nanwesend', xPos + 5, tableTop + 4, { width: colWidths.nichtAnwesend - 10, align: 'center' });
            xPos += colWidths.nichtAnwesend;
            doc.text('entschuldigt', xPos + 5, tableTop + 8, { width: colWidths.entschuldigt - 10, align: 'center' });
            xPos += colWidths.entschuldigt;
        }

        doc.text('Bemerkung / Info', xPos + 5, tableTop + 8, { width: colWidths.bemerkung - 10 });

        doc.fillColor('black');
        let yPos = tableTop + 30;

        // Table rows
        doc.font('Helvetica').fontSize(9);
        teilnehmer.forEach((person, index) => {
            if (yPos > 750) {
                doc.addPage();
                yPos = 50;
            }

            xPos = 50;
            const rowHeight = 25;

            // Draw row background (alternating)
            if (index % 2 === 0) {
                doc.rect(xPos, yPos, totalWidth, rowHeight).fill('#f8f9fa');
                doc.fillColor('black');
            }

            // Nr
            doc.text(person.nr, xPos + 5, yPos + 8, { width: colWidths.nr, align: 'center' });
            xPos += colWidths.nr;

            // Name (mit UTF-8 Normalisierung)
            doc.text(normalizePDFText(person.name), xPos + 5, yPos + 8, { width: colWidths.name });
            xPos += colWidths.name;

            // Checkboxes for status - nur für normale Dienste
            if (!isSonder) {
                const checkboxY = yPos + 7;  // Besser zentriert in der Zeile

                // anwesend
                doc.rect(xPos + 25, checkboxY, 10, 10).stroke();
                if (person.status === 'anwesend') {
                    doc.text('X', xPos + 27, checkboxY + 1);
                }
                xPos += colWidths.anwesend;

                // nicht anwesend
                doc.rect(xPos + 15, checkboxY, 10, 10).stroke();
                if (person.status === 'nicht_anwesend') {
                    doc.text('X', xPos + 17, checkboxY + 1);
                }
                xPos += colWidths.nichtAnwesend;

                // entschuldigt
                doc.rect(xPos + 18, checkboxY, 10, 10).stroke();
                if (person.status === 'entschuldigt') {
                    doc.text('X', xPos + 20, checkboxY + 1);
                }
                xPos += colWidths.entschuldigt;
            }

            // Bemerkung (mit UTF-8 Normalisierung)
            doc.text(normalizePDFText(person.bemerkung), xPos + 5, yPos + 8, {
                width: colWidths.bemerkung - 10
            });

            yPos += rowHeight;
        });

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('[ANWESENHEIT EMAIL] Fehler:', error);
        res.status(500).json({ error: 'Fehler beim Versenden der E-Mail.' });
    }
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// Static files für client.js und andere Assets
app.use('/api', express.static(path.join(__dirname, 'public')));

// Blockiere Zugriff auf sensible Dateien
app.use('/config', (req, res) => {
    res.status(404).send('Not Found');
});

app.get('*.env*', (req, res) => {
    res.status(404).send('Not Found');
});

app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
