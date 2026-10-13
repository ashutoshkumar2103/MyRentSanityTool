# MRS-3847 – Reservation source, tab 1 – label verification (multitenant)

Environment: felirenttestmultitenanten, Administrator, source "AurumCars_POA" (show/45 and edit/45), 2026-10-08.
Languages: IT, EN, ES, FR, DE (via `?lang=`). Source of truth: `res_source_first_tab_field_mapping_v4.xlsx`.
Old UI = Excel "Production label" column (IT production strings) + the old-UI screenshot (EN).

## Report 1 – Excel vs new UI (Italian), every Excel row

Legend: ✅ new UI shows exactly the Excel "new label". ❌ differs / missing.
"Old → New": Same = Excel says label unchanged; Changed = Excel documents the rename.

| ID | Old label (Excel "Production label") | New label (Excel, IT) | Old → New | Actual in app (IT) | Result |
|---|---|---|---|---|---|
| 1 | Descrizione | Descrizione | Same | Descrizione | ✅ |
| 2 | Fonte Class | Classe convenzione | Changed (confirmed) | Classe convenzione | ✅ |
| 3 | Fatturare a | Fatturare a | Same | Fatturare a | ✅ |
| 4 | Commissione | Commissione (%) | Changed | Commissione (%) | ✅ |
| 5 | Marca | Marca | Same | Marca | ✅ |
| 6 | Affiliate | Affiliato | Changed | Affiliato | ✅ |
| 7 | Permettere Sconto | Permetti sconto | Changed | Permetti sconto | ✅ |
| 8 | Consenti cambio di stagione | Consenti cambio di stagione | Same | Consenti cambio di stagione | ✅ |
| 9 | Solo RA corti (<30 gg) | Solo RA corti (< 30 gg) | Same (space only) | Solo RA corti (< 30 gg) | ✅ |
| 10 | Abilita Car Sharing | Abilita car sharing | Changed (case only) | Abilita car sharing | ✅ |
| 11 | Full Credit | Full Credit | Kept (confirmed) | Full Credit | ✅ |
| 12 | Premium | Premium | Same | Premium | ✅ |
| 13 | Walk In/No Free Upgrade | Walk-in / No free upgrade | Changed (confirmed) | Walk-in / No free upgrade | ✅ |
| 14 | Abilita funzione location area | Abilita area geografica (Location Area) | Changed (confirmed) | Abilita area geografica (Location Area) | ✅ |
| 15 | Disabilita | Disabilita | Same, moved top-right | Disabilita (top-right) | ✅ |
| 16 | Car Swap | Car Swap | Kept (confirmed) | Car Swap | ✅ |
| 17 | Car Replacement | Car Replacement | Kept (confirmed) | Car Replacement | ✅ |
| 18 | Pagamento obbligatorio per trasformare Res in RA | Richiedi pagamento per trasformare la prenotazione in RA | Changed | same as Excel | ✅ |
| 19 | Proforma per prenotazioni accettate (da OnRequest) | Genera proforma per prenotazioni accettate (OnRequest) | Changed | same as Excel | ✅ |
| 20 | Enable prepaid discount for administrator | Abilita sconto prepagato per amministratore | Changed | same as Excel | ✅ |
| 21 | Automatically Extend RA | Estendi automaticamente RA | Changed | same as Excel | ✅ |
| 22 | Automatically Invoice Generation on RA Creation | Genera automaticamente la fattura alla creazione del RA | Changed | same as Excel | ✅ |
| 23 | Guaranteed Rental | Noleggio garantito | Changed | **not on page** | ❌ missing |
| 24 | Codice accesso web | Codice accesso web | Same | Codice accesso web | ✅ |
| 25 | Group Upgrade Schema | Schema upgrade gruppi | Changed | Schema upgrade gruppi | ✅ |
| 26 | Network Sede | Network sede | Same (case) | Network sede | ✅ |
| 27 | Rental Type | Tipologia noleggio | Changed | Tipologia noleggio | ✅ |
| 28 | Set pay now Reservations with Payment and Invoice as Prepaid | Imposta pagamento e fattura delle prenotazioni Pay Now come prepagati | Changed | same as Excel | ✅ |
| 29 | Sconto XML (%) | Sconto XML (%) | Same | Sconto XML (%) | ✅ |
| 30 | Categoria OneWay | Categoria One Way | Excel says MATCH but the two labels differ | **Categoria OneWay** | ❌ |
| 31 | Mostra tutti gli optional | Mostra tutti gli optional | Same | Mostra tutti gli optional | ✅ |
| 32 | Optional venduto al Desk (non prepagato) | Optional venduti al desk (non prepagati) | Changed | same as Excel | ✅ |
| 33 | Abilita applicabilità optional per Web Service | Abilita optional per Web Service | Changed | same as Excel | ✅ |
| 34 | Abilita per Booking | Abilita per Booking | Same | Abilita per Booking | ✅ |
| 35 | Email | Email | Same | Email | ✅ |
| 36 | Promemoria | Promemoria | Same | Promemoria | ✅ |
| 37 | Pagamento non richiesto per la prenotazione creata utilizzando questa convenzione | Pagamento non richiesto per la prenotazione | Changed | same as Excel | ✅ |
| 38 | Accetta prezzo dal broker | Accetta prezzo dal broker | Same | same | ✅ |
| 39 | Pagamento anticipato per Tour Operator | Pagamento anticipato per Tour Operator | Same | same | ✅ |
| 40 | Display Fees Also In Priced Equip | Mostra le fee anche in Priced Equip | Changed (confirmed) | same as Excel | ✅ |
| 41 | Fatturare sia contratti chiusi che aperti | Fattura contratti sia chiusi sia aperti | Changed | same as Excel | ✅ |
| 42 | Fattura fino a fine mese | Fattura fino a fine mese | Same | same | ✅ |
| 43 | Crea proforma durante processa broker | Crea proforma durante il processo broker | Changed | same as Excel | ✅ |
| 44 | Attiva processo di Fatturazione Automatica | Attiva fatturazione automatica | Changed | same as Excel | ✅ |
| 45 | Fattura il 16esimo giorno del mese in aggiunta al primo | Fattura anche il 16° giorno del mese | Changed | same as Excel | ✅ |
| 46 | Non mostrare nella lista dei contratti lungo termine scaduti | Nascondi i contratti a lungo termine scaduti | Changed | same as Excel | ✅ |
| 47 | Ricalcola tariffa se RA (gia fatturato) viene prolungato | Ricalcola la tariffa se un RA già fatturato viene prolungato | Changed | same as Excel | ✅ |
| 48 | Rimuovi dalla tariffa le fasce temporali successive (al momento della creazione della prenotazione/contratto) | Rimuovi dalla tariffa le fasce temporali successive alla creazione di prenotazione/contratto | Changed | same as Excel | ✅ |
| 49 | Add label "at Event" in the print of RA | Aggiungi l’etichetta “at Event” nella stampa RA | Changed | same as Excel | ✅ |
| 50 | Invoice Until Midnight in Long-Term RA and Monthly RA | Fattura fino a mezzanotte per RA a lungo termine e mensili | Changed | same as Excel | ✅ |
| 51 | Fatturazione Mensile | Fatturazione mensile | Same (case) | **not on page** | ❌ missing |
| 52 | Note | Note interne | Changed | 7. Note interne | ✅ |
| 53 | ODA (Purchase Order Ref) | ODA (riferimento ordine di acquisto) | Changed | **not on page** | ❌ missing |
| 54 | Contract ID Job | ID contratto Job | Changed | **not on page** | ❌ missing |
| 55 | Num Conto Job | Numero conto Job | Changed | **not on page** | ❌ missing |
| 56 | Codice esportazione | Codice esportazione | Same | **not on page** | ❌ missing |
| 57 | Choose For Pay Now Or Pay Later | Modalità di pagamento online | Changed (conditional) | Modalità di pagamento online | ✅ |
| 58 | Default reservation source for online booking | Convenzione predefinita per il booking online | Changed (conditional) | same as Excel | ✅ |

Rows 53–56 belong to the section "Codici di esportazione e Job", which does not exist on the page at all.
The old-UI screenshot (tenant-based, source LUNGO TERMINE) also does not show IDs 23, 51, 53–56, so these may be conditional on a setting – needs to be confirmed.

## Report 1b – Excel EN/ES/FR/DE columns vs new UI (all other rows match exactly)

| ID | Lang | Excel (new label) | Actual in app | Problem |
|---|---|---|---|---|
| 3 | EN | Bill to | Invoice To | Old EN label still shown (Excel asks for new) |
| 3 | ES | Facturar a | Facturar A | capital A |
| 3 | DE | Rechnung an | Rechnung An | capital A |
| 24 | EN | Web access code | Web Access Code | case |
| 24 | ES | Código de acceso web | Código de Acceso Web | case |
| 24 | FR | Code d’accès web | Code d'accès Web | case |
| 30 | IT | Categoria One Way | Categoria OneWay | spacing |
| 30 | EN | One-way category | One Way Category | hyphen / case |
| 30 | ES | Categoría One Way | Categoría de ida | wrong wording |
| 30 | FR | Catégorie One Way | One Way Category | **untranslated (English)** |
| 30 | DE | One-Way-Kategorie | One Way Kategorie | hyphens |
| 9 (control) | IT | Sì | Si | accent missing |
| 9 (control) | FR | Oui | Yes | **untranslated (English)** |

## Report 2 – Pending translations (strings not in the Excel, or English where a translation is expected)

✗ = still English / wrong language in that language, ✓ = translated.

| String (where) | IT | ES | FR | DE | Suggested text (proposal, not from Excel) |
|---|---|---|---|---|---|
| "Invoice To for pay now Prepaid Reservations" (section 3, under the Pay Now toggle) | ✗ | ✗ | ✗ | ✗ | IT: Fatturare a per prenotazioni Pay Now prepagate · ES: Facturar a para reservas Pay Now prepagadas · FR: Facturer à pour les réservations Pay Now prépayées · DE: Rechnung an für vorausbezahlte Pay-Now-Reservierungen |
| Placeholder "Search" – Brand, Invoice To, Invoice To for Pay Now (3 fields) | ✗ | ✗ | ✗ | ✗ | Cerca · Buscar · Rechercher · Suchen |
| Brand dropdown default "Select One..." (other dropdowns are translated) | ✗ | ✗ | ✗ | ✗ | Seleziona... · Seleccionar uno... · Sélectionner un... · Wählen Sie eine Option... |
| "Exclude from sending to Cargos" (section 6, not in Excel) | ✓ (Escludi dall'invio a Cargos) | ✗ | ✗ | ✗ | ES: Excluir del envío a Cargos · FR: Exclure de l'envoi à Cargos · DE: Vom Versand an Cargos ausschließen |
| Short-term RA control, "Yes" | ✓ (Si → should be Sì) | ✓ | ✗ (Yes) | ✓ | FR: Oui |
| "One Way Category" (ID 30) | ✓ (spacing) | wrong ("Categoría de ida") | ✗ | ✓ (hyphens) | see Report 1b |
| Rich-text editor (Internal notes) toolbar tooltips: Undo, Redo, Bold, Italic, Underline, Strikethrough, Text color, Background color, Clear formatting, Align left/center/right, Justify, Bullet list, Numbered list, Decrease/Increase indent, Fullscreen, Preview, "Rich Text Area" (24 strings) | ✗ | ✗ | ✗ | ✗ | Editor language pack is not loaded |

Quality issues in strings that are translated (not in Excel):
- "Giorni da pagare prima dell''uscita per il Tour Operator" – IT has a doubled apostrophe.
- ES "Días para pagar antes de la recogida para Broker" – says Broker, EN/IT/DE say Tour Operator.
- EN "Days to pay before pickUp for Tour operator" – "pickUp" / "Tour operator" capitalisation; FR "tour opérateur" lower-case.
- EN tab name "Default deposit and Wavier" (typo, "Waiver") – other tab, outside this ticket.

Intentionally English per the Excel (NOT pending): Full Credit, Premium, Car Swap, Car Replacement (all languages); Walk-in / No free upgrade (IT); Pay Now / Pay Later; Priced Equip; OnRequest; "at Event"; RA; Web Service; Tour Operator; Location Area; XML; Email (IT/ES).

## Structure checks (all five languages)
- 36 checkboxes → toggles, each with an info icon. Disabilita top-right of section 1.
- Short-term RA = N/A / Sì / No segmented control. Pay Now / Pay Later segmented control.
- Sections 5 and 6 (marked Avanzato) collapsed on load. "Codici di esportazione e Job" section absent.
- "Abilita per Booking" ON shows payment mode + default convention; OFF hides them.
- Not tested: Operator role, other reservation sources, validation auto-expand.
