/**
 * Metodi di sblocco alternativi alla master password: chiave di recupero e PIN.
 *
 * Ogni metodo è uno *slot* (vedi `SlotSblocco`): la chiave SQLCipher (`dbKey`) cifrata
 * con una KEK derivata via scrypt dal segreto, più la KEK cifrata con `dbKey` per poter
 * ricifrare lo slot quando cambia la password senza conoscere il segreto.
 *
 * Lo stato è salvato in `<userData>/sblocco.json` (mai in `settings.json`, non sincronizzato).
 * Lo slot PIN è inoltre cifrato con `safeStorage` (legato all'utente del sistema operativo).
 * Il file non contiene mai in chiaro `dbKey`, chiave di recupero o PIN.
 */
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import log from 'electron-log'
import {
  deriveKey,
  getCurrentKey,
  isDatabaseOpen,
  openDatabaseWithKey,
  rekeyDatabase
} from '../db/database'
import {
  calcolaBloccoPin,
  generaChiaveRecupero as generaChiaveCasuale,
  isSlotSblocco,
  normalizzaChiave,
  validaPin
} from '../domain/sblocco'
import type { EsitoSbloccoPin, SlotSblocco, StatoSblocco } from '../../types/shared'

const FILE_NAME = 'sblocco.json'
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }
const KEY_LEN = 32
const SALT_LEN = 16
const IV_LEN = 12

interface StatoFile {
  recupero: SlotSblocco | null
  /** Slot PIN serializzato, cifrato con safeStorage, in base64. */
  pin: string | null
  pinErrori: number
  pinBloccatoFino: string | null
}

const STATO_VUOTO: StatoFile = { recupero: null, pin: null, pinErrori: 0, pinBloccatoFino: null }

/** DB aperto con la chiave di recupero, in attesa della nuova master password (solo in memoria). */
let recuperoInCorso = false

// ── Persistenza ───────────────────────────────────────────────────────────────

export function getSbloccoPath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function leggiStato(): StatoFile {
  const path = getSbloccoPath()
  if (!existsSync(path)) return { ...STATO_VUOTO }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<StatoFile>
    return {
      recupero: isSlotSblocco(raw.recupero) ? raw.recupero : null,
      pin: typeof raw.pin === 'string' ? raw.pin : null,
      pinErrori: typeof raw.pinErrori === 'number' ? raw.pinErrori : 0,
      pinBloccatoFino: typeof raw.pinBloccatoFino === 'string' ? raw.pinBloccatoFino : null
    }
  } catch (err) {
    log.warn('[sblocco] sblocco.json illeggibile, ignorato:', err)
    return { ...STATO_VUOTO }
  }
}

function scriviStato(stato: StatoFile): void {
  writeFileSync(getSbloccoPath(), JSON.stringify(stato, null, 2), 'utf-8')
}

// ── Crittografia degli slot ──────────────────────────────────────────────────

function cifra(chiave: Buffer, dati: Buffer): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', chiave, iv)
  const ct = Buffer.concat([cipher.update(dati), cipher.final()])
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join('|')
}

/** Restituisce `null` se il tag GCM non è valido (chiave errata) o il formato è corrotto. */
function decifra(chiave: Buffer, valore: string): Buffer | null {
  const parti = valore.split('|')
  if (parti.length !== 3) return null
  try {
    const [iv, tag, ct] = parti.map((p) => Buffer.from(p, 'base64'))
    const decipher = createDecipheriv('aes-256-gcm', chiave, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()])
  } catch {
    return null
  }
}

function derivaKek(segreto: string, salt: Buffer): Buffer {
  return scryptSync(segreto, salt, KEY_LEN, SCRYPT_PARAMS)
}

/** Crea uno slot che apre `dbKey` (hex 64) con `segreto`. */
export function creaSlot(segreto: string, dbKey: string): SlotSblocco {
  const salt = randomBytes(SALT_LEN)
  const kek = derivaKek(segreto, salt)
  const dbKeyBuf = Buffer.from(dbKey, 'hex')
  return {
    versione: 1,
    salt: salt.toString('base64'),
    dbKeyCifrata: cifra(kek, dbKeyBuf),
    kekCifrata: cifra(dbKeyBuf, kek)
  }
}

/** Restituisce la `dbKey` (hex) contenuta nello slot, o `null` se il segreto è errato. */
export function apriSlot(slot: SlotSblocco, segreto: string): string | null {
  const kek = derivaKek(segreto, Buffer.from(slot.salt, 'base64'))
  const dbKey = decifra(kek, slot.dbKeyCifrata)
  return dbKey === null ? null : dbKey.toString('hex')
}

/** Ricifra lo slot per `nuovaDbKey` usando la KEK recuperata con `vecchiaDbKey`. */
function ricifraSlot(slot: SlotSblocco, vecchiaDbKey: string, nuovaDbKey: string): SlotSblocco {
  const kek = decifra(Buffer.from(vecchiaDbKey, 'hex'), slot.kekCifrata)
  if (kek === null) throw new Error('SLOT_NON_RICIFRABILE')
  const nuovaBuf = Buffer.from(nuovaDbKey, 'hex')
  return {
    versione: 1,
    salt: slot.salt,
    dbKeyCifrata: cifra(kek, nuovaBuf),
    kekCifrata: cifra(nuovaBuf, kek)
  }
}

function sigillaPin(slot: SlotSblocco): string {
  return safeStorage.encryptString(JSON.stringify(slot)).toString('base64')
}

/** Decifra lo slot PIN con safeStorage; `null` se non disponibile o non decifrabile. */
function apriSigilloPin(sigillo: string): SlotSblocco | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const slot: unknown = JSON.parse(safeStorage.decryptString(Buffer.from(sigillo, 'base64')))
    return isSlotSblocco(slot) ? slot : null
  } catch {
    return null
  }
}

function verificaPassword(password: string): string {
  const corrente = getCurrentKey()
  if (corrente === null || deriveKey(password) !== corrente) throw new Error('PASSWORD_WRONG')
  return corrente
}

// ── Stato ──────────────────────────────────────────────────────────────────────

export function statoSblocco(ora: Date = new Date()): StatoSblocco {
  const stato = leggiStato()
  const bloccoAttivo =
    stato.pinBloccatoFino !== null && new Date(stato.pinBloccatoFino).getTime() > ora.getTime()
  return {
    recuperoAttivo: stato.recupero !== null,
    pinAttivo: stato.pin !== null,
    pinBloccatoFino: stato.pin !== null && bloccoAttivo ? stato.pinBloccatoFino : null,
    pinDisponibile: safeStorage.isEncryptionAvailable()
  }
}

export function getSlotRecupero(): SlotSblocco | null {
  return leggiStato().recupero
}

export function isRecuperoInCorso(): boolean {
  return recuperoInCorso
}

/** Azzera contatore e blocco del PIN (sblocco riuscito con password o PIN). */
export function azzeraContatorePin(): void {
  const stato = leggiStato()
  if (stato.pinErrori === 0 && stato.pinBloccatoFino === null) return
  scriviStato({ ...stato, pinErrori: 0, pinBloccatoFino: null })
}

// ── Chiave di recupero ────────────────────────────────────────────────────────

function nuovoSlotRecupero(dbKey: string): string {
  const chiave = generaChiaveCasuale()
  const normalizzata = normalizzaChiave(chiave)
  if (normalizzata === null) throw new Error('Chiave generata non valida')
  scriviStato({ ...leggiStato(), recupero: creaSlot(normalizzata, dbKey) })
  return chiave
}

/**
 * Crea (o sostituisce) la chiave di recupero. Richiede il DB aperto e la master password.
 * @returns la chiave formattata `XXXX-XXXX-…`
 * @throws Error('PASSWORD_WRONG')
 */
export function generaChiaveRecupero(password: string): string {
  const dbKey = verificaPassword(password)
  const chiave = nuovoSlotRecupero(dbKey)
  log.info('[sblocco] Chiave di recupero generata')
  return chiave
}

/**
 * Restituisce la `dbKey` aperta con la chiave di recupero.
 * @throws Error('CHIAVE_ERRATA') se la chiave non è valida o non apre lo slot.
 */
export function dbKeyDaChiave(slot: SlotSblocco, chiave: string): string {
  const normalizzata = normalizzaChiave(chiave)
  const dbKey = normalizzata === null ? null : apriSlot(slot, normalizzata)
  if (dbKey === null) throw new Error('CHIAVE_ERRATA')
  return dbKey
}

/**
 * Apre il DB con la chiave di recupero e imposta `recuperoInCorso`.
 * @throws RECUPERO_NON_DISPONIBILE | CHIAVE_ERRATA | CHIAVE_NON_VALIDA | DB_APERTURA_FALLITA |
 *   MIGRATION_FAILED: …
 */
export function sbloccaConChiave(chiave: string): void {
  if (isDatabaseOpen()) throw new Error('DB_GIA_APERTO')
  const slot = leggiStato().recupero
  if (slot === null) throw new Error('RECUPERO_NON_DISPONIBILE')
  const dbKey = dbKeyDaChiave(slot, chiave)
  try {
    openDatabaseWithKey(dbKey)
  } catch (err) {
    // DB_APERTURA_FALLITA (problema dell'ambiente) e MIGRATION_FAILED passano invariati:
    // lo slot di recupero resta valido e il recupero non risulta in corso.
    if (err instanceof Error && err.message === 'PASSWORD_WRONG')
      throw new Error('CHIAVE_NON_VALIDA')
    throw err
  }
  azzeraContatorePin()
  recuperoInCorso = true
  log.info('[sblocco] DB aperto con la chiave di recupero')
}

/**
 * Completa il recupero: rekey alla nuova password, ricifra il PIN, crea una nuova chiave
 * (la precedente smette di valere).
 * @returns la nuova chiave di recupero formattata
 * @throws RECUPERO_NON_IN_CORSO | VALIDATION_ERROR
 */
export function completaRecupero(nuovaPassword: string): string {
  if (!recuperoInCorso) throw new Error('RECUPERO_NON_IN_CORSO')
  if (!nuovaPassword || nuovaPassword.length < 8) {
    throw new Error('VALIDATION_ERROR: nuovaPassword: minimo 8 caratteri')
  }
  const vecchiaDbKey = getCurrentKey()
  if (vecchiaDbKey === null) throw new Error('RECUPERO_NON_IN_CORSO')
  rekeyDatabase(nuovaPassword)
  const nuovaDbKey = deriveKey(nuovaPassword)
  ricifraPin(vecchiaDbKey, nuovaDbKey)
  const chiave = nuovoSlotRecupero(nuovaDbKey)
  recuperoInCorso = false
  log.info('[sblocco] Recupero completato: nuova password e nuova chiave')
  return chiave
}

// ── Ricifratura al cambio di dbKey ────────────────────────────────────────────

function ricifraPin(vecchiaDbKey: string, nuovaDbKey: string): void {
  const stato = leggiStato()
  if (stato.pin === null) return
  const slot = apriSigilloPin(stato.pin)
  if (slot === null) {
    scriviStato({ ...stato, pin: null, pinErrori: 0, pinBloccatoFino: null })
    log.warn('[sblocco] Slot PIN non decifrabile: PIN disattivato')
    return
  }
  try {
    scriviStato({ ...stato, pin: sigillaPin(ricifraSlot(slot, vecchiaDbKey, nuovaDbKey)) })
  } catch (err) {
    scriviStato({ ...stato, pin: null, pinErrori: 0, pinBloccatoFino: null })
    log.error('[sblocco] Ricifratura dello slot PIN fallita: PIN disattivato', err)
  }
}

/**
 * Dopo un cambio password ricifra gli slot esistenti (recupero e PIN) per la nuova dbKey,
 * così chiave e PIN restano validi.
 */
export function ricifraSlotDopoCambioPassword(vecchiaDbKey: string, nuovaDbKey: string): void {
  const stato = leggiStato()
  if (stato.recupero !== null) {
    try {
      scriviStato({ ...stato, recupero: ricifraSlot(stato.recupero, vecchiaDbKey, nuovaDbKey) })
    } catch (err) {
      log.error('[sblocco] Ricifratura dello slot di recupero fallita:', err)
    }
  }
  ricifraPin(vecchiaDbKey, nuovaDbKey)
}

// ── PIN ────────────────────────────────────────────────────────────────────────

/**
 * Crea o sostituisce il PIN. Richiede il DB aperto e la master password.
 * @throws PASSWORD_WRONG | PIN_FORMATO_NON_VALIDO | PIN_NON_DISPONIBILE
 */
export function impostaPin(password: string, pin: string): void {
  const dbKey = verificaPassword(password)
  if (!validaPin(pin)) throw new Error('PIN_FORMATO_NON_VALIDO')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('PIN_NON_DISPONIBILE')
  scriviStato({
    ...leggiStato(),
    pin: sigillaPin(creaSlot(pin, dbKey)),
    pinErrori: 0,
    pinBloccatoFino: null
  })
  log.info('[sblocco] PIN impostato')
}

export function disattivaPin(): void {
  scriviStato({ ...leggiStato(), pin: null, pinErrori: 0, pinBloccatoFino: null })
  log.info('[sblocco] PIN disattivato')
}

/**
 * Sblocca il DB con il PIN. Un tentativo durante il blocco non viene contato.
 * @throws MIGRATION_FAILED: … se il DB si apre ma le migrazioni falliscono
 * @throws DB_APERTURA_FALLITA se il DB non si apre per un problema tecnico (tentativo non contato)
 */
export function sbloccaConPin(pin: string, ora: Date = new Date()): EsitoSbloccoPin {
  if (isDatabaseOpen()) throw new Error('DB_GIA_APERTO')
  const stato = leggiStato()
  if (stato.pin === null) return { esito: 'disattivato' }

  if (stato.pinBloccatoFino !== null && new Date(stato.pinBloccatoFino).getTime() > ora.getTime()) {
    return { esito: 'bloccato', bloccatoFino: stato.pinBloccatoFino }
  }

  const slot = apriSigilloPin(stato.pin)
  if (slot === null) {
    disattivaPin()
    log.warn('[sblocco] Slot PIN non decifrabile con safeStorage: PIN disattivato')
    return { esito: 'disattivato' }
  }

  const dbKey = validaPin(pin) ? apriSlot(slot, pin) : null
  if (dbKey === null) {
    const errori = stato.pinErrori + 1
    const blocco = calcolaBloccoPin(errori, ora)
    if (blocco.disattiva) {
      disattivaPin()
      log.warn('[sblocco] Troppi PIN errati: PIN disattivato')
      return { esito: 'disattivato' }
    }
    scriviStato({ ...stato, pinErrori: errori, pinBloccatoFino: blocco.bloccatoFino })
    return { esito: 'errato', bloccatoFino: blocco.bloccatoFino }
  }

  try {
    openDatabaseWithKey(dbKey)
  } catch (err) {
    if (err instanceof Error && err.message === 'PASSWORD_WRONG') {
      disattivaPin()
      log.warn('[sblocco] Il PIN non apre più il DB (slot superato): PIN disattivato')
      return { esito: 'disattivato' }
    }
    // Problema dell'ambiente (es. modulo nativo per un altro ABI): il tentativo non conta,
    // slot PIN, contatore e blocco restano invariati.
    if (err instanceof Error && err.message === 'DB_APERTURA_FALLITA') throw err
    // PIN corretto ma migrazioni fallite: il DB è aperto, il contatore si azzera.
    azzeraContatorePin()
    throw err
  }
  azzeraContatorePin()
  log.info('[sblocco] DB aperto con il PIN')
  return { esito: 'ok' }
}

// ── Backup e reset ────────────────────────────────────────────────────────────

/**
 * Dopo un ripristino riuscito: PIN disattivato, contatore azzerato, slot di recupero
 * corrente = quello del backup (o nessuno). Con `conChiave` il recupero è in corso.
 */
export function applicaDopoRipristino(slotBackup: SlotSblocco | null, conChiave: boolean): void {
  scriviStato({ recupero: slotBackup, pin: null, pinErrori: 0, pinBloccatoFino: null })
  recuperoInCorso = conChiave
}

/** Reset distruttivo: elimina `sblocco.json`. */
export function eliminaStatoSblocco(): void {
  const path = getSbloccoPath()
  if (existsSync(path)) unlinkSync(path)
  recuperoInCorso = false
}
