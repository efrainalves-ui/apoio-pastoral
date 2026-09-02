import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'

/**
 * Texto simples, em linguagem de pastor. Não é parecer jurídico e não afirma
 * certificação: descreve o que o aplicativo faz com os dados.
 */
export function PrivacyPage() {
  return <div className="page-stack page-narrow">
    <Link className="text-link back-link" to="/app/configuracoes"><ArrowLeft />Voltar às configurações</Link>
    <header className="page-hero"><div><h1>Privacidade</h1></div></header>

    <Card title="Quem controla os dados">
      <ul className="plain-list">
        <li>Cada conta pertence a um pastor e cuida apenas do distrito dele.</li>
        <li>Um pastor não vê, não pesquisa, não sincroniza nem restaura dados de outro.</li>
        <li>Não há compartilhamento interno entre contas nem transferência de um distrito para outro.</li>
        <li>Associação, Missão ou outra instituição não participa do acesso a este aplicativo.</li>
      </ul>
    </Card>

    <Card title="O que o aplicativo guarda">
      <ul className="plain-list">
        <li>Igrejas, membros e famílias do distrito.</li>
        <li>Visitas, pedidos de oração, acompanhamentos e tarefas.</li>
        <li>Agenda, sermões, metas, campanhas e comissões.</li>
        <li>Suas áreas pessoais: leitura e orçamento familiar.</li>
      </ul>
      <p className="muted">A finalidade é pastoral e organizacional: cuidar das pessoas e organizar o trabalho do distrito.</p>
    </Card>

    <Card title="Onde os dados ficam">
      <ul className="plain-list">
        <li>Tudo é gravado cifrado no aparelho e abre com a sua senha.</li>
        <li>Com a sincronização ligada, o serviço remoto recebe apenas conteúdo cifrado — ele não lê nomes, visitas nem anotações.</li>
        <li>Backups que você baixa ficam sob sua responsabilidade, fora do aplicativo.</li>
      </ul>
    </Card>

    <Card title="Relatórios">
      <ul className="plain-list">
        <li>Os relatórios saem sem nomes: números, totais e informações agregadas.</li>
        <li>Um relatório com nomes só é gerado quando você marca essa opção na hora.</li>
        <li>Pedidos de oração, observações privadas e anotações não entram em relatório padrão.</li>
      </ul>
    </Card>

    <Card title="Pedidos de acesso, correção, exportação ou exclusão">
      <ul className="plain-list">
        <li>O canal de contato é o e-mail cadastrado nesta conta.</li>
        <li>No perfil de cada pessoa você gera a exportação legível dos dados dela.</li>
        <li>No mesmo lugar você apaga os dados dela, incluindo visitas, pedidos e vínculos.</li>
      </ul>
    </Card>

    <Card title="Encerrar o distrito">
      <p>Em Configurações, a ação <strong>Encerrar distrito</strong> apaga os dados do distrito deste aparelho e do serviço de sincronização, revoga os aparelhos autorizados e mantém a conta e as áreas pessoais. Depois disso você começa um novo distrito vazio na mesma conta.</p>
      <Link className="text-link" to="/app/configuracoes/encerrar-distrito">Abrir Encerrar distrito</Link>
    </Card>

    <Card title="Sobre este texto">
      <p className="muted">Este texto explica o funcionamento do aplicativo em linguagem simples. Não é aconselhamento jurídico e não afirma certificação de nenhuma lei.</p>
    </Card>
  </div>
}
