import React from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './ui/Modal'
import type { BloccoChangelog, SegmentoChangelog, VoceChangelog } from '../../../types/shared'

interface ChangelogModalProps {
  isOpen: boolean
  voci: VoceChangelog[]
  onClose: () => void
}

function Segmenti({ segmenti }: { segmenti: SegmentoChangelog[] }): React.JSX.Element {
  return (
    <>
      {segmenti.map((s, i) => {
        switch (s.tipo) {
          case 'grassetto':
            return <strong key={i}>{s.testo}</strong>
          case 'corsivo':
            return <em key={i}>{s.testo}</em>
          case 'codice':
            return (
              <code
                key={i}
                className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono"
              >
                {s.testo}
              </code>
            )
          default:
            return <React.Fragment key={i}>{s.testo}</React.Fragment>
        }
      })}
    </>
  )
}

function Blocchi({ blocchi }: { blocchi: BloccoChangelog[] }): React.JSX.Element {
  const nodi: React.ReactNode[] = []
  let i = 0
  while (i < blocchi.length) {
    const b = blocchi[i]
    if (b.tipo === 'voce') {
      const inizio = i
      const voci: BloccoChangelog[] = []
      while (i < blocchi.length && blocchi[i].tipo === 'voce') {
        voci.push(blocchi[i])
        i++
      }
      nodi.push(
        <ul
          key={`ul-${inizio}`}
          className="list-disc pl-5 space-y-1 text-sm text-gray-700 dark:text-gray-300"
        >
          {voci.map((v, j) => (
            <li key={j}>
              <Segmenti segmenti={v.segmenti} />
            </li>
          ))}
        </ul>
      )
      continue
    }
    if (b.tipo === 'titolo') {
      nodi.push(
        <h4
          key={i}
          className="mt-4 text-sm font-semibold text-gray-800 dark:text-gray-200"
        >
          <Segmenti segmenti={b.segmenti} />
        </h4>
      )
    } else {
      nodi.push(
        <p key={i} className="text-sm text-gray-700 dark:text-gray-300">
          <Segmenti segmenti={b.segmenti} />
        </p>
      )
    }
    i++
  }
  return <div className="space-y-2">{nodi}</div>
}

export default function ChangelogModal({
  isOpen,
  voci,
  onClose,
}: ChangelogModalProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('changelog.titolo')} maxWidth="max-w-2xl">
      <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-1">
        {voci.map((voce) => (
          <section key={voce.versione}>
            <h3 className="pb-1 mb-2 text-base font-semibold text-primary-700 dark:text-primary-400 border-b border-gray-200 dark:border-gray-700">
              {voce.data !== ''
                ? t('changelog.versione_data', { versione: voce.versione, data: voce.data })
                : t('changelog.versione', { versione: voce.versione })}
            </h3>
            <Blocchi blocchi={voce.blocchi} />
          </section>
        ))}
      </div>
      <div className="flex justify-end mt-5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        >
          {t('changelog.chiudi')}
        </button>
      </div>
    </Modal>
  )
}
