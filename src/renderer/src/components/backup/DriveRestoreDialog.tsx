import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import {
  CredenzialeRipristinoCampi,
  costruisciCredenziali,
  erroreChiaveRipristino,
  type ModoCredenziale
} from '../sicurezza/CredenzialeRipristino'
import type { DriveBackupItem } from '../../../../types/shared'

interface DriveRestoreDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function DriveRestoreDialog({
  isOpen,
  onClose,
}: DriveRestoreDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<DriveBackupItem[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modo, setModo] = useState<ModoCredenziale>('password')
  const [password, setPassword] = useState('')
  const [chiave, setChiave] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoadingList(true)
    setListError(false)
    window.api.backup.drive
      .list()
      .then((list) => setItems(list))
      .catch(() => setListError(true))
      .finally(() => setLoadingList(false))
  }, [isOpen])

  function handleClose(): void {
    if (isLoading) return
    setItems([])
    setSelectedId(null)
    setModo('password')
    setPassword('')
    setChiave('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    if (!selectedId) return
    const credenziali = costruisciCredenziali(modo, password, chiave)
    if (credenziali === null) {
      setError(
        modo === 'password'
          ? t('backup.ripristina_password_obbligatoria')
          : t('backup.ripristina_chiave_obbligatoria')
      )
      return
    }
    setIsLoading(true)
    try {
      await window.api.backup.drive.restore({ fileId: selectedId, ...credenziali })
      setSuccess(true)
      setTimeout(() => {
        if ('restart' in window.api.app) {
          void (window.api.app as { restart?: () => void }).restart?.()
        } else {
          window.location.reload()
        }
      }, 2000)
    } catch (err: unknown) {
      const chiaveKey = erroreChiaveRipristino(err)
      setError(chiaveKey !== null ? t(chiaveKey) : t('backup.drive_ripristina_errore'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('backup.drive_ripristina_titolo')} maxWidth="max-w-lg">
      {success ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400"
        >
          {t('backup.drive_ripristina_completato')}
        </div>
      ) : (
        <form onSubmit={(e) => { void handleSubmit(e) }} noValidate>
          <div className="space-y-5">

            {/* Avviso distruttivo */}
            <div
              role="alert"
              className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
            >
              {t('backup.ripristina_avviso')}
            </div>

            {/* Lista backup Drive */}
            <div>
              <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('backup.drive_ripristina_scegli')}
              </p>
              {loadingList ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('backup.drive_lista_caricamento')}
                </p>
              ) : listError ? (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {t('backup.drive_lista_errore')}
                </p>
              ) : items.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('backup.drive_lista_vuota')}
                </p>
              ) : (
                <ul className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((it) => (
                    <li key={it.id}>
                      <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                        <input
                          type="radio"
                          name="drive-backup"
                          checked={selectedId === it.id}
                          onChange={() => setSelectedId(it.id)}
                          className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-gray-900 dark:text-gray-100">{it.nome}</span>
                        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                          {it.createdAt}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Credenziale del backup: master password o chiave di recupero */}
            <CredenzialeRipristinoCampi
              idPrefix="drive-restore"
              modo={modo}
              onModo={(m) => { setModo(m); setError(null) }}
              password={password}
              onPassword={(v) => { setPassword(v); setError(null) }}
              chiave={chiave}
              onChiave={(v) => { setChiave(v); setError(null) }}
              disabled={isLoading}
            />

            {/* Errore */}
            {error !== null && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
              >
                {error}
              </div>
            )}

            {/* Azioni */}
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isLoading || !selectedId}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {isLoading ? t('common.loading') : t('backup.ripristina_conferma')}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}
