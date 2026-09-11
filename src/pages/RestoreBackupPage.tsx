import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RestaurarBackup } from '../components/RestaurarBackup'

/**
 * Restaurar antes de existir distrito.
 *
 * Um aparelho novo, ou um cujo cofre esvaziou, cai na primeira configuração e
 * é convidado a criar um distrito. Quem tem o arquivo de backup não quer criar
 * nada: quer o distrito que já existe de volta. Sem esta porta, o único
 * caminho era inventar um distrito e restaurar por cima dele.
 */
export function RestoreBackupPage() {
  return <div className="setup-page">
    <div className="setup-card setup-card--wide page-stack">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Já tenho um backup</p>
          <h1>Restaurar seu distrito</h1>
          <p>Use o arquivo e o código que você guardou. O distrito volta como estava, sem precisar cadastrar nada de novo.</p>
        </div>
      </header>
      <RestaurarBackup />
      <Link className="text-link back-link" to="/configuracao-inicial"><ArrowLeft aria-hidden="true" />Voltar para a primeira configuração</Link>
    </div>
  </div>
}
