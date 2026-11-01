import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import {
  CredenzialeRipristinoCampi,
  costruisciCredenziali,
  erroreChiaveRipristino,
  type ModoCredenziale
} from '../sicurezza/CredenzialeRipristino'

interface RestoreDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function RestoreDialog({ isOpen, onClose }: RestoreDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()

  const [backupPath, setBackupPath] = useState('')
  const [modo, setModo] = useState<ModoCredenziale>('password')
  const [password, setPassword] = useState('')
  const [chiave, setChiave] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleClose(): void {
    if (isLoading) return
    setBackupPath('')
    setModo('password')
    setPassword('')
    setChiave('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  async function handleSfoglia(): Promise<void> {
    setError(null)
    try {
      const res = await window.api.dialog.showOpenDialog({
        filters: [{ name: 'GymManager Backup', extensions: ['db'] }]
      })
      if (!res.canceled && res.filePaths[0]) {
        setBackupPath(res.filePaths[0])
      }
    } catch {
      setError(t('backup.ripristina_errore'))
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)

    if (!backupPath.trim()) {
      setError(t('backup.ripristina_percorso_obbligatorio'))
      return
    }
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
      await window.api.backup.ripristina({ backupPath: backupPath.trim(), ...credenziali })
      setSuccess(true)
      setTimeout(() => {
        if ('restart' in window.api.app) {
          void (window.api.app as { restart?: () => void }).restart?.()
        } else {
          window.location.reload()
        }
      }, 2000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const chiaveKey = erroreChiaveRipristino(err)
      if (message.includes('DRIVE_NOT_CONFIGURED')) {
        setError(t('backup.drive_non_configurato'))
      } else if (chiaveKey !== null) {
        setError(t(chiaveKey))
      } else {
        setError(t('backup.ripristina_errore'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('backup.ripristina_titolo')} maxWidth="max-w-lg">
      {success ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400"
        >
          {t('backup.ripristina_completato')}
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

            {/* Percorso file backup */}
            <div>
              <label
                htmlFor="restore-path"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                {t('backup.ripristina_percorso')}
              </label>
              <div className="flex gap-2">
                <input
                  id="restore-path"
                  type="text"
                  value={backupPath}
                  readOnly
                  placeholder={t('backup.ripristina_percorso_placeholder')}
                  className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => void handleSfoglia()}
                  disabled={isLoading}
                  className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('backup.ripristina_sfoglia')}
                </button>
              </div>
            </div>

            {/* Credenziale del backup: master password o chiave di recupero */}
            <CredenzialeRipristinoCampi
              idPrefix="restore"
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
                disabled={isLoading}
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
