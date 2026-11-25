import { useSearchParams } from 'react-router-dom'
import { PageHeader, Tabs } from '../components/ui'
import CadPage from './Cad'
import CadFiles from './CadFiles'

type Mode = 'plan' | 'dxf'

/** Раздел «Чертежи»: демо-план с AI-командами и рабочие DXF-чертежи */
export default function CadSection() {
  const [params, setParams] = useSearchParams()
  const mode: Mode = params.get('mode') === 'dxf' ? 'dxf' : 'plan'
  const setMode = (m: Mode) => { const n = new URLSearchParams(params); n.set('mode', m); setParams(n, { replace: true }) }
  return (
    <div>
      <Tabs<Mode> value={mode} onChange={setMode} tabs={[{ key: 'plan', label: 'AI CAD (демо-план)' }, { key: 'dxf', label: 'Чертежи DXF' }]} />
      {mode === 'plan' ? <CadPage /> : (
        <>
          <PageHeader title="Чертежи DXF" subtitle="Загрузка рабочих чертежей, просмотр по слоям, измерения, правки с версиями и подсчёт объёмов по геометрии" />
          <CadFiles />
        </>
      )}
    </div>
  )
}
