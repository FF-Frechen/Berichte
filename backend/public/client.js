// Feuerwehr Einsatz-Dokumentation Client
// Optimierte Version ohne Frontend-PDF-Generierung

let namensListe = [];
let currentEinsatzId = null;
let signaturePad;
let currentFahrzeug;
let currentPosition;
let currentRow;
let currentVersionToSend = null;
let currentVersionPdfId = null;

const SERVER_URL = '/api';

// XSS-Schutz: HTML-Escape Funktion
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Fahrzeugkonfiguration - wird beim Start vom Backend geladen
let besatzungen = {};
let fahrzeugNamen = {};
let vehicleOrder = []; // Speichert die Reihenfolge der Fahrzeuge

// API-Funktionen
async function ladeNamen() {
  try {
    const response = await fetch(`${SERVER_URL}/namen`);
    if (!response.ok) throw new Error('Datei nicht gefunden');
    const data = await response.json();
    namensListe = data.namen || [];
    console.log(`${namensListe.length} Namen erfolgreich geladen`);
  } catch (error) {
    console.error('Fehler beim Laden der Namen:', error);
  }
}

async function ladeFahrzeuge() {
  try {
    const response = await fetch(`${SERVER_URL}/fahrzeuge`);
    if (!response.ok) throw new Error('Fahrzeugkonfiguration nicht gefunden');
    const data = await response.json();

    // Initialisiere die Fahrzeug-Objekte basierend auf der .env-Konfiguration
    besatzungen = {};
    fahrzeugNamen = {};
    vehicleOrder = [];

    data.vehicles.forEach(vehicle => {
      const { id, displayName, functions } = vehicle;

      // Speichere Reihenfolge
      vehicleOrder.push(id);

      // Initialisiere Besatzung mit den Funktionen
      besatzungen[id] = functions.map(position => ({
        position,
        name: "",
        signature: null,
        pa: false,
        paMinuten: ""
      }));

      // Speichere Display-Namen
      fahrzeugNamen[id] = displayName;
    });

    console.log(`✓ ${data.vehicles.length} Fahrzeuge aus .env geladen`);

    // Aktualisiere die UI mit den geladenen Fahrzeugen
    updateFahrzeugCheckboxes();

  } catch (error) {
    console.error('Fehler beim Laden der Fahrzeuge:', error);
    alert('Fehler beim Laden der Fahrzeugkonfiguration. Bitte prüfen Sie die .env.fahrzeuge Datei.');
  }
}

async function loadEinsatzDaten() {
  const params = new URLSearchParams(window.location.search);
  const einsatznummer = params.get('einsatznummer');
  
  if (!einsatznummer) {
    alert('Keine Einsatznummer gefunden.');
    window.location.href = 'input_doku.html';
    return;
  }
  
  currentEinsatzId = einsatznummer;
  
  try {
    const response = await fetch(`${SERVER_URL}/einsatz/${einsatznummer}`);
    
    if (!response.ok) {
      const localData = localStorage.getItem(`einsatz_${einsatznummer}`);
      if (localData) {
        const data = JSON.parse(localData);
        applyEinsatzData(data);
      } else {
        initializeNewEinsatz(einsatznummer, params);
      }
      return;
    }
    
    const data = await response.json();
    
    if (!data.einsatz || (!data.fahrzeuge.length && !data.besatzungen.length)) {
      const localData = localStorage.getItem(`einsatz_${einsatznummer}`);
      if (localData) {
        applyEinsatzData(JSON.parse(localData));
      } else {
        initializeNewEinsatz(einsatznummer, params);
      }
      return;
    }
    
    applyEinsatzData(data);
    
    // Nur PDF-Versionen laden wenn bereits welche existieren
    loadPDFVersions(currentEinsatzId);
    
  } catch (error) {
    console.error('Fehler beim Laden:', error);
    const localData = localStorage.getItem(`einsatz_${einsatznummer}`);
    if (localData) {
      applyEinsatzData(JSON.parse(localData));
    } else {
      alert('Fehler beim Laden der Daten.');
      window.location.href = 'input_doku.html';
    }
  }
}

function initializeNewEinsatz(einsatznummer, params) {
  currentEinsatzId = einsatznummer;
  
  document.getElementById('info-einsatznummer').textContent = einsatznummer;
  document.getElementById('info-datum').textContent = params.get('datum') || new Date().toLocaleDateString('de-DE');
  document.getElementById('info-uhrzeit').textContent = params.get('uhrzeit') || new Date().toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
  document.getElementById('info-einsatzstelle').textContent = params.get('einsatzstelle') || '';
  document.getElementById('info-einsatzleiter').textContent = params.get('einsatzleiter') || '-';
  
  updateFahrzeugTables();
}

function applyEinsatzData(data) {
  try {
    const einsatz = data.einsatz;
    const fahrzeuge = data.fahrzeuge || [];
    const besatzungenData = data.besatzungen || [];

    currentEinsatzId = einsatz.einsatznummer;

    document.getElementById('info-einsatznummer').textContent = einsatz.einsatznummer;
    document.getElementById('info-datum').textContent = einsatz.datum;
    document.getElementById('info-uhrzeit').textContent = einsatz.uhrzeit;
    document.getElementById('info-einsatzstelle').textContent = einsatz.einsatzstelle;
    document.getElementById('info-einsatzleiter').textContent = einsatz.einsatzleiter || '-';

    fahrzeuge.forEach(f => {
      const checkbox = document.getElementById(`fahrzeug-${f.fahrzeug}`);
      if (checkbox) checkbox.checked = true;
      const bereitCheckbox = document.getElementById(`bereit-${f.fahrzeug}`);
      if (bereitCheckbox) bereitCheckbox.checked = f.bereitstellung;
    });

    besatzungenData.forEach(b => {
      // Prüfe ob das Fahrzeug in der aktuellen Konfiguration existiert
      if (!besatzungen[b.fahrzeug]) {
        console.warn(`Fahrzeug ${b.fahrzeug} nicht in aktueller Konfiguration gefunden - überspringe`);
        return;
      }

      const member = besatzungen[b.fahrzeug].find(m => m.position === b.position);
      if (member) {
        member.name = b.name || "";
        member.signature = b.signature || null;
        member.pa = b.pa || false;
        member.paMinuten = b.paMinuten || "";
      }
    });

    updateFahrzeugTables();
  } catch (error) {
    console.error('Fehler in applyEinsatzData:', error);
    throw error; // Re-throw damit es vom Aufrufer behandelt wird
  }
}

function updateFahrzeugTables() {
  const fahrzeugContainer = document.getElementById("fahrzeug-container");
  const selectedFahrzeuge = getSelectedFahrzeuge();
  fahrzeugContainer.innerHTML = "";
  
  selectedFahrzeuge.forEach(fahrzeugTyp => {
    createFahrzeugSection(fahrzeugTyp);
  });
}

function createFahrzeugSection(fahrzeugTyp) {
  const fahrzeugContainer = document.getElementById("fahrzeug-container");
  const fahrzeugSection = document.createElement("div");
  fahrzeugSection.className = "fahrzeug-section";
  
  const fahrzeugTitle = document.createElement("h3");
  fahrzeugTitle.textContent = getFahrzeugName(fahrzeugTyp);
  fahrzeugSection.appendChild(fahrzeugTitle);
  
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  
  ["Position", "Name", "Unterschrift", "PA"].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    if (text === "Name") th.className = "name-cell";
    if (text === "Unterschrift") th.className = "signature-cell";
    if (text === "PA") th.style.width = "80px";
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  const tbody = document.createElement("tbody");
  besatzungen[fahrzeugTyp].forEach((member, index) => {
    const row = document.createElement("tr");
    row.id = `row-${fahrzeugTyp}-${index}`;
    
    const posCell = document.createElement("td");
    posCell.textContent = member.position;
    row.appendChild(posCell);
    
    const nameCell = document.createElement("td");
    nameCell.style.position = "relative";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Name eingeben";
    nameInput.value = member.name;
    nameInput.autocomplete = "off";
    nameInput.addEventListener("change", (e) => {
      besatzungen[fahrzeugTyp][index].name = e.target.value;
      saveDataLocal();
    });
    nameCell.appendChild(nameInput);
    row.appendChild(nameCell);
    autocomplete(nameInput, namensListe);
    
    const signatureCell = document.createElement("td");
    const signButton = document.createElement("button");
    signButton.textContent = member.signature ? "Neu unterschreiben" : "Unterschreiben";
    signButton.addEventListener("click", () => {
      openSignatureModal(fahrzeugTyp, index, member.position, row);
    });
    const signatureImage = document.createElement("img");
    signatureImage.id = `signature-img-${fahrzeugTyp}-${index}`;
    signatureImage.className = "signature-image hidden";
    signatureImage.style.display = "none";
    if (member.signature) {
      signatureImage.src = member.signature;
      signatureImage.classList.remove("hidden");
      signatureImage.style.display = "block";
    }
    signatureCell.appendChild(signButton);
    signatureCell.appendChild(signatureImage);
    row.appendChild(signatureCell);
    
    const paCell = document.createElement("td");
    const paCheckbox = document.createElement("input");
    paCheckbox.type = "checkbox";
    paCheckbox.checked = member.pa;
    paCheckbox.addEventListener("change", (e) => {
      besatzungen[fahrzeugTyp][index].pa = e.target.checked;
      const paInput = document.getElementById(`pa-input-${fahrzeugTyp}-${index}`);
      paInput.style.display = e.target.checked ? "block" : "none";
      if (e.target.checked) {
        paInput.required = true;
        paInput.focus();
      } else {
        paInput.required = false;
      }
      saveDataLocal();
    });
    const paInput = document.createElement("input");
    paInput.type = "number";
    paInput.id = `pa-input-${fahrzeugTyp}-${index}`;
    paInput.placeholder = "Min";
    paInput.style.width = "60px";
    paInput.style.marginTop = "5px";
    paInput.style.display = member.pa ? "block" : "none";
    paInput.value = member.paMinuten;
    paInput.addEventListener("change", (e) => {
      besatzungen[fahrzeugTyp][index].paMinuten = e.target.value;
      saveDataLocal();
    });
    paInput.addEventListener("blur", (e) => {
      const checkbox = paCell.querySelector('input[type="checkbox"]');
      if (checkbox.checked && (e.target.value === '' || e.target.value === null)) {
        alert('⚠️ Bitte geben Sie die PA-Zeit in Minuten an (0 ist erlaubt)!');
        e.target.focus();
      }
    });
    paCell.appendChild(paCheckbox);
    paCell.appendChild(paInput);
    row.appendChild(paCell);
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  fahrzeugSection.appendChild(table);
  fahrzeugContainer.appendChild(fahrzeugSection);
}

function getSelectedFahrzeuge() {
  const selected = [];
  vehicleOrder.forEach(id => {
    const checkbox = document.getElementById(`fahrzeug-${id}`);
    if (checkbox && checkbox.checked) selected.push(id);
  });
  return selected;
}

function getFahrzeugName(typ) {
  return fahrzeugNamen[typ];
}

// Zeige Speicher-Benachrichtigung
function showSaveNotification(message, isError = false) {
  // Erstelle Notification-Element falls nicht vorhanden
  let notification = document.getElementById('save-notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'save-notification';
    notification.className = 'save-notification';
    document.body.appendChild(notification);
  }

  // Setze Nachricht und Stil
  notification.textContent = message;
  if (isError) {
    notification.classList.add('error');
  } else {
    notification.classList.remove('error');
  }

  // Zeige Notification
  notification.classList.add('show');

  // Verstecke nach 3 Sekunden
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

function saveDataLocal() {
  const dataToSave = {
    einsatz: {
      einsatznummer: currentEinsatzId,
      datum: document.getElementById('info-datum').textContent,
      uhrzeit: document.getElementById('info-uhrzeit').textContent,
      einsatzstelle: document.getElementById('info-einsatzstelle').textContent,
      einsatzleiter: document.getElementById('info-einsatzleiter').textContent
    },
    fahrzeuge: getSelectedFahrzeuge().map(f => ({
      fahrzeug: f,
      name: f,
      bereitstellung: document.getElementById(`bereit-${f}`)?.checked || false
    })),
    besatzungen: []
  };
  
  getSelectedFahrzeuge().forEach(fahrzeugTyp => {
    besatzungen[fahrzeugTyp].forEach(member => {
      dataToSave.besatzungen.push({
        fahrzeug: fahrzeugTyp,
        position: member.position,
        name: member.name || "",
        signature: member.signature || "",
        pa: member.pa || false,
        paMinuten: member.paMinuten || ""
      });
    });
  });
  
  localStorage.setItem(`einsatz_${currentEinsatzId}`, JSON.stringify(dataToSave));
}

// Hauptfunktion: Speichern der Daten
async function saveData() {
  saveDataLocal();

  const besatzungenArray = [];
  getSelectedFahrzeuge().forEach(fahrzeugTyp => {
    besatzungen[fahrzeugTyp].forEach(member => {
      besatzungenArray.push({
        fahrzeug: fahrzeugTyp,
        position: member.position,
        name: member.name || "",
        signature: member.signature || "",
        pa: member.pa || false,
        paMinuten: member.paMinuten || ""
      });
    });
  });

  const einsatzData = {
    einsatznummer: currentEinsatzId,
    datum: document.getElementById('info-datum').textContent,
    uhrzeit: document.getElementById('info-uhrzeit').textContent,
    einsatzstelle: document.getElementById('info-einsatzstelle').textContent,
    einsatzleiter: document.getElementById('info-einsatzleiter').textContent,
    fahrzeuge: getSelectedFahrzeuge().map(f => ({
      fahrzeug: f,
      name: f,
      bereitstellung: document.getElementById(`bereit-${f}`)?.checked || false
    })),
    besatzungen: besatzungenArray
  };

  try {
    const response = await fetch(`${SERVER_URL}/einsatz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(einsatzData)
    });

    if (response.ok) {
      console.log('Daten erfolgreich gespeichert');
      showSaveNotification('✓ Daten erfolgreich gespeichert');
      return true;
    } else {
      const error = await response.json();
      console.error(`Fehler beim Speichern: ${error.error}`);
      showSaveNotification('✗ Fehler beim Speichern', true);
      return false;
    }
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    showSaveNotification('⚠ Netzwerkfehler - Lokal gespeichert', true);
    return false;
  }
}

// OPTIMIERT: PDF-Generierung nur noch über Backend-API
async function generatePDF() {
  // Erst Daten speichern
  const saved = await saveData();
  if (saved) {
    console.log('Daten wurden gespeichert, starte PDF-Generierung...');
  }
  
  const einsatzleiter = document.getElementById('info-einsatzleiter').textContent;
  
  // Zeige Ladeanzeige
  const generateButton = document.querySelector('button[onclick="generatePDF()"]');
  const originalText = generateButton ? generateButton.textContent : '';
  if (generateButton) {
    generateButton.textContent = '⏳ PDF wird erstellt...';
    generateButton.disabled = true;
  }
  
  try {
    // Rufe Backend-API auf für PDF-Generierung
    const response = await fetch(`${SERVER_URL}/pdf/generate/${currentEinsatzId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createdBy: einsatzleiter || 'System'
      })
    });
    
    if (generateButton) {
      generateButton.textContent = originalText;
      generateButton.disabled = false;
    }
    
    if (response.ok) {
      const result = await response.json();
      alert(`✓ PDF erfolgreich erstellt!\n\nVersion: ${result.version}\nDatei: ${result.filename}`);
      
      // Speichere die aktuelle Version für den Send-Button
      currentVersionToSend = result.version;
      currentVersionPdfId = result.id;
      
      // Zeige den "Version X verschicken" Button
      const sendBtn = document.getElementById('send-current-version-btn');
      if (sendBtn) {
        sendBtn.textContent = `📧 Version ${result.version} verschicken`;
        sendBtn.style.display = 'inline-block';
      }
      
      // PDF-Liste aktualisieren
      await loadPDFVersions(currentEinsatzId);
    } else {
      const error = await response.json();
      alert(`Fehler beim Erstellen der PDF: ${error.error}`);
    }
  } catch (error) {
    console.error('Fehler bei PDF-Generierung:', error);
    
    if (generateButton) {
      generateButton.textContent = originalText;
      generateButton.disabled = false;
    }
    
    alert('Fehler beim Erstellen der PDF: ' + error.message);
  }
}

// PDF-Versionen laden
async function loadPDFVersions(einsatznummer) {
  try {
    const response = await fetch(`${SERVER_URL}/pdf/list/${einsatznummer}`);
    if (response.ok) {
      const pdfs = await response.json();
      const pdfVersionsDiv = document.getElementById('pdf-versions');
      const pdfList = document.getElementById('pdf-list');
      
      if (pdfs.length === 0) {
        pdfVersionsDiv.style.display = 'none';
      } else {
        pdfVersionsDiv.style.display = 'block';
        pdfList.innerHTML = pdfs.map(pdf => {
          let created_at_utc = pdf.created_at;
          if (created_at_utc && !created_at_utc.endsWith('Z')) {
            created_at_utc = created_at_utc.replace(' ', 'T') + 'Z';
          }
          const date = new Date(created_at_utc).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

          // XSS-Fix: Escape User-Daten
          const safeCreatedBy = escapeHtml(pdf.created_by);

          const emailButton = pdf.email_sent === 1
            ? '<button disabled style="background-color: #6c757d; cursor: not-allowed;">✅ Versendet</button>'
            : `<button onclick="sendPDFEmail(${pdf.id}, ${pdf.version})" style="background-color: #198754;">📧 E-Mail senden</button>`;

          return `<div class="pdf-item">
            <div><strong>Version ${pdf.version}</strong><br><small>${date}${pdf.created_by ? ` - ${safeCreatedBy}` : ''}</small></div>
            <div class="pdf-actions">
              <a href="${SERVER_URL}/pdf/file/${pdf.id}" target="_blank">Download</a>
              ${emailButton}
              <button onclick="deletePDF(${pdf.id}, ${pdf.version})" style="background-color: #d62828;">🗑️ Löschen</button>
            </div>
          </div>`;
        }).join('');
      }
    }
  } catch (error) {
    console.error('Fehler beim Laden der PDFs:', error);
  }
}

// PDF löschen
async function deletePDF(pdfId, version) {
  if (!confirm(`Möchten Sie wirklich Version ${version} löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden!`)) {
    return;
  }
  const password = prompt('Bitte geben Sie das Lösch-Passwort ein:');
  if (!password) return;
  
  try {
    const response = await fetch(`${SERVER_URL}/pdf/${pdfId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    if (response.ok) {
      alert(`Version ${version} wurde erfolgreich gelöscht.`);
      loadPDFVersions(currentEinsatzId);
    } else {
      const error = await response.json();
      alert(`Fehler: ${error.error}`);
    }
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    alert('Fehler beim Löschen der PDF.');
  }
}

// PDF per E-Mail versenden (automatisch an konfigurierte Empfänger)
async function sendPDFEmail(pdfId, version) {
  if (!confirm(`E-Mail für Version ${version} an die konfigurierten Empfänger senden?`)) {
    return;
  }
  
  try {
    const response = await fetch(`${SERVER_URL}/pdf/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfId })
    });
    
    if (response.ok) {
      const result = await response.json();
      alert(`✅ E-Mail wurde erfolgreich an ${result.recipients} Empfänger versendet!`);
      
      // Wenn die versendete Version die aktuelle ist, verstecke den unteren Button
      if (currentVersionToSend === version) {
        const sendBtn = document.getElementById('send-current-version-btn');
        if (sendBtn) {
          sendBtn.style.display = 'none';
        }
      }
      
      // Liste neu laden um Button-Status zu aktualisieren
      loadPDFVersions(currentEinsatzId);
    } else {
      const error = await response.json();
      alert(`Fehler beim E-Mail-Versand: ${error.error}`);
    }
  } catch (error) {
    console.error('Fehler beim E-Mail-Versand:', error);
    alert('Fehler beim E-Mail-Versand.');
  }
}

// Funktion für den unteren "Version X verschicken" Button
async function sendCurrentVersion() {
  if (!currentVersionPdfId || !currentVersionToSend) {
    alert('Keine Version zum Versenden verfügbar.');
    return;
  }
  
  if (!confirm(`E-Mail für Version ${currentVersionToSend} an die konfigurierten Empfänger senden?`)) {
    return;
  }
  
  try {
    const response = await fetch(`${SERVER_URL}/pdf/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfId: currentVersionPdfId })
    });
    
    if (response.ok) {
      const result = await response.json();
      alert(`✅ E-Mail wurde erfolgreich an ${result.recipients} Empfänger versendet!`);
      
      // Verstecke den Button nach erfolgreichem Versand
      const sendBtn = document.getElementById('send-current-version-btn');
      if (sendBtn) {
        sendBtn.style.display = 'none';
      }
      
      // Liste neu laden um Button-Status zu aktualisieren
      loadPDFVersions(currentEinsatzId);
    } else {
      const error = await response.json();
      alert(`Fehler beim E-Mail-Versand: ${error.error}`);
    }
  } catch (error) {
    console.error('Fehler beim E-Mail-Versand:', error);
    alert('Fehler beim E-Mail-Versand.');
  }
}

// Autocomplete-Funktionalität
function autocomplete(inp, arr) {
  let currentFocus;
  
  inp.addEventListener("input", function(e) {
    const val = this.value;
    closeAllLists();
    if (!val) return false;
    currentFocus = -1;
    
    const autocompleteList = document.createElement("div");
    autocompleteList.setAttribute("class", "autocomplete-items");
    this.parentNode.appendChild(autocompleteList);
    
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].toLowerCase().includes(val.toLowerCase())) {
        const item = document.createElement("div");
        const startIndex = arr[i].toLowerCase().indexOf(val.toLowerCase());

        // XSS-Fix: DOM-Methoden statt innerHTML
        const textBefore = document.createTextNode(arr[i].substr(0, startIndex));
        const strong = document.createElement("strong");
        strong.textContent = arr[i].substr(startIndex, val.length);
        const textAfter = document.createTextNode(arr[i].substr(startIndex + val.length));
        const hiddenInput = document.createElement("input");
        hiddenInput.type = "hidden";
        hiddenInput.value = arr[i];

        item.appendChild(textBefore);
        item.appendChild(strong);
        item.appendChild(textAfter);
        item.appendChild(hiddenInput);

        item.addEventListener("click", function(e) {
          inp.value = this.getElementsByTagName("input")[0].value;
          const event = new Event('change');
          inp.dispatchEvent(event);
          closeAllLists();
        });
        
        autocompleteList.appendChild(item);
      }
    }
  });
  
  inp.addEventListener("keydown", function(e) {
    let x = this.parentNode.querySelector(".autocomplete-items");
    if (x) x = x.getElementsByTagName("div");
    
    if (e.keyCode === 40) {
      currentFocus++;
      addActive(x);
    } else if (e.keyCode === 38) {
      currentFocus--;
      addActive(x);
    } else if (e.keyCode === 13) {
      e.preventDefault();
      if (currentFocus > -1) {
        if (x) x[currentFocus].click();
      }
    }
  });
  
  function addActive(x) {
    if (!x) return false;
    removeActive(x);
    if (currentFocus >= x.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = (x.length - 1);
    x[currentFocus].classList.add("autocomplete-active");
  }
  
  function removeActive(x) {
    for (let i = 0; i < x.length; i++) {
      x[i].classList.remove("autocomplete-active");
    }
  }
}

function closeAllLists(elmnt) {
  const items = document.getElementsByClassName("autocomplete-items");
  for (let i = 0; i < items.length; i++) {
    if (elmnt !== items[i] && elmnt !== items[i].previousSibling) {
      items[i].parentNode.removeChild(items[i]);
    }
  }
}

// Signature Modal Funktionen
function openSignatureModal(fahrzeugTyp, index, position, row) {
  closeAllLists(); // Schließe Autocomplete-Dropdown bevor Modal öffnet

  currentFahrzeug = fahrzeugTyp;
  currentPosition = index;
  currentRow = row;

  document.getElementById("current-position").textContent = position;
  document.getElementById("signature-modal").style.display = "block";
  
  if (signaturePad) {
    signaturePad.clear();
  }
  
  if (besatzungen[fahrzeugTyp][index].signature) {
    signaturePad.fromDataURL(besatzungen[fahrzeugTyp][index].signature);
  }
  
  resizeCanvas();
}

function closeSignatureModal() {
  document.getElementById("signature-modal").style.display = "none";
}

function clearSignature() {
  if (signaturePad) {
    signaturePad.clear();
  }
}

function saveSignature() {
  if (signaturePad.isEmpty()) {
    alert("Bitte unterschreiben Sie zuerst.");
    return;
  }
  
  const dataURL = signaturePad.toDataURL();
  besatzungen[currentFahrzeug][currentPosition].signature = dataURL;
  
  const signatureImg = document.getElementById(`signature-img-${currentFahrzeug}-${currentPosition}`);
  signatureImg.src = dataURL;
  signatureImg.classList.remove("hidden");
  signatureImg.style.display = "block";
  
  const signButton = currentRow.querySelector("button");
  signButton.textContent = "Neu unterschreiben";
  
  saveDataLocal();
  closeSignatureModal();
}

function initSignaturePad() {
  const canvas = document.getElementById("signature-pad");
  signaturePad = new SignaturePad(canvas, {
    backgroundColor: "rgb(255, 255, 255)",
    penColor: "rgb(0, 0, 0)"
  });
  
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
}

function resizeCanvas() {
  const canvas = document.getElementById("signature-pad");
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  canvas.getContext("2d").scale(ratio, ratio);
  
  if (signaturePad) {
    const data = signaturePad.toData();
    signaturePad.clear();
    if (data && data.length > 0) {
      signaturePad.fromData(data);
    }
  }
}

// Dynamisches Generieren der Fahrzeug-Checkboxen
function updateFahrzeugCheckboxes() {
  const container = document.getElementById('fahrzeug-auswahl-container');
  if (!container) {
    console.warn('Fahrzeug-Auswahl-Container nicht gefunden');
    return;
  }

  // Leere den Container
  container.innerHTML = '';

  // Generiere Checkboxen in der Reihenfolge der .env
  vehicleOrder.forEach(vehicleId => {
    const displayName = fahrzeugNamen[vehicleId];
    if (!displayName) return;

    // Extrahiere Kurzname (z.B. "FRE1/HLF20/1" aus "FRE1/HLF20/1 - Hilfeleistungslöschfahrzeug")
    const shortName = displayName.split(' - ')[0];

    const optionDiv = document.createElement('div');
    optionDiv.className = 'fahrzeug-option';

    optionDiv.innerHTML = `
      <input type="checkbox" id="fahrzeug-${vehicleId}" value="${vehicleId}">
      <label for="fahrzeug-${vehicleId}">${shortName}</label>
      <input type="checkbox" id="bereit-${vehicleId}">
      <label for="bereit-${vehicleId}">Bereitstellung</label>
    `;

    container.appendChild(optionDiv);
  });

  // Event-Listener für alle Checkboxen hinzufügen
  const checkboxes = container.querySelectorAll('input[type="checkbox"][id^="fahrzeug-"]');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener("change", updateFahrzeugTables);
  });

  console.log('✓ Fahrzeug-Checkboxen dynamisch generiert');
}

// Initialisierung beim Laden der Seite
document.addEventListener("DOMContentLoaded", async function() {
  initSignaturePad();

  // Lade zuerst die Fahrzeuge, dann Namen, dann Einsatzdaten
  await ladeFahrzeuge();
  await ladeNamen();
  await loadEinsatzDaten();

  document.addEventListener("click", function(e) {
    closeAllLists(e.target);
  });
});

// Globale Funktionen für onclick-Handler
window.saveData = saveData;
window.generatePDF = generatePDF;
window.sendPDFEmail = sendPDFEmail;
window.sendCurrentVersion = sendCurrentVersion;
window.deletePDF = deletePDF;
window.openSignatureModal = openSignatureModal;
window.closeSignatureModal = closeSignatureModal;
window.clearSignature = clearSignature;
window.saveSignature = saveSignature;
