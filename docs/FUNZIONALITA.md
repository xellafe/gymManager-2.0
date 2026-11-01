# GymManager 2.0 — Dettaglio funzionalità per sezione

Documento di dettaglio funzionale/UX, complementare a SPEC.md e DOMAIN-MODEL.md.

## Clienti

### Anagrafica — campi
Obbligatori: **nome**, **cognome**, **codice fiscale**.
- Codice fiscale: validato, con **calcolo bidirezionale** — dai dati di nascita (data, sesso, comune) si calcola il CF e, viceversa, dal CF si precompilano data di nascita, sesso e comune. Override manuale sempre possibile.
- Indirizzo (via/civico, città, provincia, CAP): richiesto **al momento di emettere la ricevuta** (un cliente può essere salvato senza, ma la ricevuta lo pretende).
- Email, telefono: opzionali.
- **Numero tessera/socio**: assegnato automaticamente, **sovrascrivibile** dall'utente; univoco.
- Minore e tutore: se minorenne (derivato dalla data di nascita) si abilita la sezione Tutore (nome, cognome, codice fiscale, indirizzo se diverso). Per i minori la ricevuta è intestata al tutore con la dicitura "Tutore di [CF del minore]".
- Certificato medico: tipo (es. non agonistico / agonistico) e data di scadenza; stato derivato valido / in scadenza / scaduto.
- Gestione: stato (attivo / anonimizzato), note libere, data di inserimento.
- Nessun consenso privacy nella v1.

### Lista clienti
Tabella con ricerca (nome/cognome/CF) e filtri: stato iscrizione (attiva / scaduta / assente), certificato (valido / in scadenza / scaduto), tipo di abbonamento attivo. Colonne: nome, iscrizione (badge + scadenza), certificato (badge), numero di abbonamenti attivi. Azioni: nuovo cliente, apri dettaglio.

### Dettaglio cliente
Intestazione: nome, badge stato, badge "minorenne" se applicabile; azioni Modifica, Emetti ricevuta, menu altre azioni (incl. anonimizza).
Sezioni:
- **Anagrafica** (campi + sezione Tutore se minore).
- **Iscrizione attiva**: tipo, periodo, badge stato; azioni Rinnova, Modifica date, Invalida. Se assente: stato evidente + CTA "Assegna iscrizione".
- **Abbonamenti**: tabella (tipo, periodo, stato, azioni per riga) + "Assegna abbonamento"; segnalazione visibile per abbonamenti con scadenza oltre l'iscrizione.
- **Certificato medico**: tipo, scadenza, badge; azione Aggiorna.
- **Ricevute**: numero, data, importo, stato pagamento, stato (emessa/annullata); visualizza/scarica PDF, annulla; "Emetti ricevuta".
Storico: di default solo gli elementi attivi; storico di iscrizioni e abbonamenti espandibile.

### Assegnamento iscrizioni/abbonamenti
- Iscrizione: scegli il tipo (catalogo, solo attivi), data inizio (default oggi), scadenza (da durata del tipo, modificabile), prezzo (default dal tipo, modificabile), pagamento + metodo, opzione "emetti ricevuta ora". Se esiste già un'iscrizione attiva, il comando diventa "Rinnova" (nuovo periodo, storico preservato). Mai due iscrizioni attive (invariante).
- Abbonamento: analogo. Bloccato se il cliente non ha un'iscrizione attiva. Se la scadenza dell'abbonamento supera quella dell'iscrizione → segnalazione non bloccante, conferma dell'utente.
- Pagamento e ricevuta: stato (pagato / da incassare) e metodo vivono sulla singola assegnazione. All'emissione si possono raggruppare più voci pagabili in una **ricevuta multi-riga**; le voci incluse diventano "pagate". Per pagamenti elettronici gestiti altrove, si può marcare "pagato" senza emettere ricevuta.

## Catalogo iscrizioni / abbonamenti

Anagrafica dei *tipi*, gestita in modo analogo per iscrizioni e abbonamenti.

Campi per tipo: nome (es. "Tesseramento annuale", "Sala pesi"), descrizione opzionale, **durata di default in mesi** (scadenza = data inizio + durata), prezzo di default, stato (attivo / non valido). Per i tipi di **abbonamento** è prevista anche una **categoria/colore**, usata dal widget "distribuzione abbonamenti per tipo" della dashboard.

Interfaccia: lista dei tipi con stato e ricerca, più toggle "mostra anche i non validi"; creazione e modifica in finestra.

Regole:
- Eliminazione consentita **solo se nessun cliente è mai stato assegnato** a quel tipo; altrimenti "Elimina" è disabilitato e si offre "Invalida" (toglie dagli assegnabili mantenendo lo storico).
- Modificare prezzo o durata di default **non è retroattivo**: ogni assegnazione ha copiato i valori al momento dell'assegnazione.

## Configurazione

Aree:
- **Dati attività**: ragione sociale, indirizzo, Cod.Fis./P.IVA (intestazione della ricevuta).
- **Logo**: upload immagine, usato su ricevuta e interfaccia.
- **Aspetto**: colore primario, tema chiaro/scuro.
- **Ricevute**: numero iniziale per anno (con avviso); **dicitura a piè di ricevuta** come campo libero configurabile (testo deciso dall'utente).
- **Scadenze**: intervalli di segnalazione **distinti** per certificati medici, iscrizioni e abbonamenti.
- **Backup**: percorso locale; frequenza automatica configurabile (default: a ogni chiusura dell'app) + backup manuale on-demand; collegamento a Google Drive (connetti/disconnetti).
- **Lingua**: selezione lingua UI (IT di default).
- **Sicurezza**: cambio master password; **chiave di recupero** (24 caratteri, mostrata al primo avvio, rigenerabile da Impostazioni, con "Copia" e salvataggio in `.txt`) per sbloccare i dati e scegliere una nuova password se la si dimentica, valida anche per ripristinare i backup (locali e Drive) creati da ora in poi; **PIN di sblocco** facoltativo di 6 lettere o cifre, solo su questo PC, con blocco temporaneo dopo 5 errori e disattivazione al 10°; reset con avviso di perdita dati come ultima risorsa.

## Ricevute

### Emissione
- Avvio dal dettaglio cliente ("Emetti ricevuta") o dall'opzione "emetti ricevuta ora" in fase di assegnamento.
- Voci: la schermata elenca le voci pagabili del cliente (iscrizione/abbonamenti con stato "da incassare"); selezioni quelle da includere e formano le righe. Per riga: voce, periodo, prezzo (precaricato dall'assegnazione). È possibile aggiungere una **riga libera** (addebito una tantum non legato a un'assegnazione: descrizione + prezzo).
- Intestatario: cliente, o tutore se minorenne (dicitura "Tutore di [CF del minore]").
- **Data di emissione**: scelta dall'utente al momento della generazione (default oggi).
- Metodo di pagamento; dicitura a piè precaricata dalla configurazione, modificabile per la singola ricevuta.
- Il numero **non** è assegnato in anteprima: al salvataggio l'app assegna il numero progressivo della serie dell'anno della data di emissione, marca le voci incluse come "pagate" e genera il PDF. Da quel momento il numero è immutabile e i re-download producono lo stesso documento.

### Numerazione
- Serie progressiva per **anno della data di emissione** (emessa nel 2025 → `2025-N`, nel 2026 → `2026-N`); riparte ogni anno; numero iniziale per anno configurabile (vedi Configurazione). Assegnato al salvataggio.
- Annullamento: mantiene il numero (stato "annullata"), nessun buco nella serie; le voci coperte tornano "da incassare".

### Elenco ricevute
- Pagina globale Ricevute: numero, data, cliente, importo, metodo, stato pagamento, stato (emessa/annullata); filtri per anno/stato/cliente, ricerca per numero; azioni: visualizza/scarica PDF, annulla.
- Nel dettaglio cliente: elenco delle sole ricevute del cliente.

### PDF
- Intestazione: dati attività e logo (dalla configurazione), "Ricevuta n. AAAA-N", data di emissione, etichetta copia ("Copia cliente" / "Copia matrice").
- Blocco intestatario (con riga tutore se minore); tabella Attività | Durata | Prezzo; Totale.
- Importi in € con IVA inclusa; date gg/mm/aaaa.
- **Due copie per pagina** (copia cliente + copia matrice).
- Nessun "codice univoco" stampato.
- Generazione deterministica dal record salvato (stesso numero, stessi dati).

## Dashboard

Home dell'app. In alto un **selettore di periodo** globale (default "questo mese"; opzioni: ultimi 30 giorni, quest'anno, intervallo personalizzato) che alimenta i widget "di periodo".

### Widget
Indicatori sintetici: soci con iscrizione attiva (totale); clienti da rinnovare (iscrizione scaduta); certificati medici in scadenza/scaduti; incassi del periodo.

Allerta (conteggio + anteprima + drill-down): certificati medici in scadenza/scaduti; iscrizioni/abbonamenti in scadenza.

Analisi: distribuzione abbonamenti per tipo (con i colori dei tipi); incassi del periodo (pagato vs da incassare, ricevute emesse); nuovi tesseramenti nel periodo; **compleanni della settimana** (widget attivabile, spento di default).

### Comportamento
- Finestre temporali: i widget "in scadenza" usano gli intervalli configurati (distinti per certificati / iscrizioni / abbonamenti); i widget "di periodo" seguono il selettore globale.
- Drill-down al click: certificati in scadenza → lista clienti filtrata; segmento del grafico (es. "Yoga") → clienti con quell'abbonamento; "da incassare" → elenco delle voci non saldate.
- Personalizzazione: l'utente può **mostrare/nascondere** i widget dalla Configurazione, a partire da un set predefinito; il riordino è previsto come miglioria successiva.
