/**
 * As classes da Escola Sabatina que são de crianças.
 *
 * Quem aparece numa unidade sem estar no cadastro da igreja não é erro do
 * relatório: a Escola Sabatina e o Pequeno Grupo recebem quem não é membro, e é
 * justamente essa pessoa que interessa acompanhar. Ela entra como interessada —
 * menos nas classes de crianças, onde a ficha de interessado não é o
 * instrumento certo e a decisão não é dela.
 *
 * A regra do pastor é por idade, acima de oito anos. O relatório não traz idade
 * de quem não é cadastrado, e a classe é o que existe para dizer isso: rol,
 * jardim e primários são as classes abaixo dessa faixa.
 */
const CLASSES_DE_CRIANCAS = ['rol', 'berco', 'bercario', 'jardim', 'primario', 'infantil', 'infantis']

function semAcento(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('pt-BR')
}

export function ehClasseInfantil(nomeDaUnidade: string): boolean {
  const nome = semAcento(nomeDaUnidade)
  return CLASSES_DE_CRIANCAS.some((palavra) => nome.includes(palavra))
}
