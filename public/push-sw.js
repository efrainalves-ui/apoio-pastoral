/*
  Notificações dos lembretes, dentro do service worker.

  O servidor manda só "Você tem um lembrete" e uma chave opaca. Se o pastor
  escolheu ver o título, e o cofre deste aparelho ainda está aberto (sessão
  mantida, dentro do prazo), o título é decifrado aqui, no próprio aparelho.
  Sem isso, o aviso fica genérico. Nada decifrado sai do aparelho.
*/

const BANCO_DO_PUSH = 'apoio-pastoral-lembretes-push'
const AVISO_GENERICO = 'Você tem um lembrete'

function pedir(requisicao) {
  return new Promise((resolve, reject) => {
    requisicao.onsuccess = () => resolve(requisicao.result)
    requisicao.onerror = () => reject(requisicao.error)
  })
}

async function bancoExiste(nome) {
  if (!indexedDB.databases) return false
  const bancos = await indexedDB.databases()
  return bancos.some((banco) => banco.name === nome)
}

async function ler(nomeDoBanco, deposito, chave) {
  if (!(await bancoExiste(nomeDoBanco))) return null
  const banco = await pedir(indexedDB.open(nomeDoBanco))
  try {
    if (!banco.objectStoreNames.contains(deposito)) return null
    return (await pedir(banco.transaction(deposito, 'readonly').objectStore(deposito).get(chave))) ?? null
  } finally {
    banco.close()
  }
}

function deBase64Url(texto) {
  const base = texto.replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base + '='.repeat((4 - (base.length % 4)) % 4))
  return Uint8Array.from(binario, (letra) => letra.charCodeAt(0))
}

async function tituloDecifrado(chave) {
  if (!chave || !(await ler(BANCO_DO_PUSH, 'preferencias', 'mostrarTitulo'))) return null
  const ocorrencia = await ler(BANCO_DO_PUSH, 'mapa', chave)
  if (!ocorrencia) return null
  const sessao = await ler('apoio-pastoral-sessao', 'chaves', 'atual')
  if (!sessao || !sessao.master || sessao.expiresAt < Date.now() || sessao.accountId !== ocorrencia.accountId) return null
  const registro = await ler('apoio-pastoral', 'vaultRecords', ocorrencia.recordId)
  if (!registro || registro.deletedAt || registro.recordType !== 'reminder') return null
  const aberto = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deBase64Url(registro.iv), additionalData: deBase64Url(registro.aad), tagLength: 128 },
    sessao.master,
    deBase64Url(registro.ciphertext),
  )
  const { data } = JSON.parse(new TextDecoder().decode(aberto))
  const alteracao = ocorrencia.ocorrencia && data.ocorrencias && data.ocorrencias[ocorrencia.ocorrencia] && data.ocorrencias[ocorrencia.ocorrencia].alteracao
  return (alteracao && alteracao.titulo) || data.titulo || null
}

/*
  Aparelho revogado não mostra nada — nem o aviso genérico.

  A inscrição já é apagada no serviço quando a revogação acontece, e a função
  de envio só entrega a aparelho ativo. Esta é a terceira trava, a que funciona
  mesmo sem internet: a marca fica gravada no próprio aparelho. Além de não
  mostrar, ele cancela a inscrição, para o serviço de push parar de procurá-lo.
*/
async function aparelhoRevogado() {
  try { return (await ler(BANCO_DO_PUSH, 'preferencias', 'revogado')) === true } catch { return false }
}

self.addEventListener('push', (evento) => {
  let dados = {}
  try { dados = evento.data ? evento.data.json() : {} } catch { dados = {} }
  evento.waitUntil((async () => {
    if (await aparelhoRevogado()) {
      try { const inscricao = await self.registration.pushManager.getSubscription(); if (inscricao) await inscricao.unsubscribe() } catch { /* já cancelada */ }
      return
    }
    let corpo = AVISO_GENERICO
    try { corpo = (await tituloDecifrado(dados.chave)) || AVISO_GENERICO } catch { corpo = AVISO_GENERICO }
    await self.registration.showNotification('Apoio Pastoral', {
      body: corpo,
      tag: dados.tag || 'apoio-pastoral-lembrete',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: typeof dados.url === 'string' && dados.url.startsWith('/app/') ? dados.url : '/app/lembretes' },
    })
  })())
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = (evento.notification.data && evento.notification.data.url) || '/app/lembretes'
  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const janela of janelas) {
      if ('focus' in janela) {
        await janela.focus()
        if ('navigate' in janela) await janela.navigate(destino)
        return
      }
    }
    await self.clients.openWindow(destino)
  })())
})
