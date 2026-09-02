/**
 * Tradução única das falhas do serviço.
 *
 * O Supabase devolve mensagens técnicas em inglês, às vezes com nome de tabela
 * ou de função dentro. Nada disso pode chegar à tela: o pastor precisa saber o
 * que fazer, e o texto cru também contaria a quem estivesse olhando como o
 * serviço é montado por dentro. Toda chamada remota passa por aqui.
 */

interface FalhaRemota { message?: string | null; code?: string | null }

const MENSAGENS: Array<[RegExp, string]> = [
  [/sessao nao autenticada|sessao sem identificacao|JWT|not authenticated/iu,
    'Sua sessão no serviço expirou. Entre novamente com e-mail e senha.'],
  [/esta sessao ainda nao esta ligada a um aparelho autorizado|aparelho sem autorizacao ativa/u,
    'Este aparelho ainda não está liberado para sincronizar. Confirme-o em um aparelho onde você já entra.'],
  [/aparelho revogado/u,
    'Este aparelho foi removido da conta e não sincroniza mais. Autorize-o de novo por outro aparelho.'],
  [/este aparelho pertence a outra conta/u,
    'Este aparelho já está ligado a outra conta.'],
  [/esta sessao ja pertence a outro aparelho/u,
    'Esta entrada já está ligada a outro aparelho. Saia e entre novamente.'],
  [/um aparelho nao confirma a si mesmo/u,
    'A confirmação precisa vir de outro aparelho onde você já entra.'],
  [/nenhum aparelho pendente com esse identificador/u,
    'Não há aparelho aguardando confirmação com esse código.'],
  [/nenhum aparelho ativo com esse identificador/u,
    'Este aparelho já havia sido removido.'],
  [/dados de aparelho invalidos|lote invalido|lote grande demais/u,
    'O aplicativo enviou um pedido que o serviço não aceitou. Tente de novo.'],
  [/duplicate key|unique constraint/iu,
    'Este registro já existe no serviço.'],
  [/row-level security|permission denied|insufficient privilege/iu,
    'Sua conta não tem permissão para esta ação no serviço.'],
  [/fetch|network|timeout|Failed to fetch/iu,
    'Sem conexão com o serviço agora. Suas alterações ficam guardadas neste aparelho.'],
]

/**
 * Devolve um `Error` já pronto para a tela. `padrao` é o que sobra quando a
 * falha não se encaixa em nenhum caso conhecido — nunca a mensagem original.
 */
export function falhaRemota(erro: FalhaRemota | Error | null | undefined, padrao: string): Error {
  const bruto = (erro && 'message' in erro ? erro.message : null) ?? ''
  for (const [padraoTexto, mensagem] of MENSAGENS) {
    if (padraoTexto.test(bruto)) return new Error(mensagem)
  }
  return new Error(padrao)
}
