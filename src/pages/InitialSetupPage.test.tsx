import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InitialSetupPage } from './InitialSetupPage'

const auth = vi.hoisted(() => ({ account: { id: 'conta-configuracao-ficticia' }, masterKey: {} as CryptoKey }))
const setup = vi.hoisted(() => ({ organize: vi.fn(() => Promise.resolve({ churches: 1, people: 1, birthdays: 0 })) }))
const pdf = vi.hoisted(() => ({ extractPdfText: vi.fn(() => Promise.resolve('DISTRITO: Distrito Fictício\nIGREJA: Igreja Fictícia\nPessoa Anônima Fictícia')), validatePdfFile: vi.fn() }))
const parser = vi.hoisted(() => ({ parseDistrictListText: vi.fn(() => ({ districtName: 'Distrito Fictício', rows: [{ churchName: 'Igreja Fictícia', name: 'Pessoa Anônima Fictícia', birthDate: null, needsReview: false }], unparsedLines: ['linha fictícia'] })) }))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => auth }))
vi.mock('../setup/service', () => ({ InitialSetupService: class { organize = setup.organize } }))
vi.mock('../imports/pdf', () => ({ extractPdfText: pdf.extractPdfText, validatePdfFile: pdf.validatePdfFile }))
vi.mock('../imports/parsers', () => ({ parseDistrictListText: parser.parseDistrictListText }))

afterEach(() => { cleanup(); setup.organize.mockReset(); setup.organize.mockResolvedValue({ churches: 1, people: 1, birthdays: 0 }); pdf.extractPdfText.mockResolvedValue('DISTRITO: Distrito Fictício\nIGREJA: Igreja Fictícia\nPessoa Anônima Fictícia') })

async function openReview(user = userEvent.setup()) {
  render(<MemoryRouter><InitialSetupPage /></MemoryRouter>)
  await user.type(screen.getByLabelText('Nome do distrito'), 'Distrito Fictício')
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  await user.upload(screen.getByLabelText(/Selecionar PDF/i), new File(['conteúdo fictício'], 'lista-ficticia.pdf', { type: 'application/pdf' }))
  await screen.findByRole('heading', { name: 'Confira a lista' })
  return user
}

describe('configuração inicial', () => {
  it('permite seguir pelo cadastro manual', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><InitialSetupPage /></MemoryRouter>)
    await user.type(screen.getByLabelText('Nome do distrito'), 'Distrito Fictício')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Cadastrar manualmente' }))
    expect(await screen.findByRole('heading', { name: 'Distrito organizado' })).toBeInTheDocument()
    expect(setup.organize).toHaveBeenCalledWith('conta-configuracao-ficticia', auth.masterKey, { districtName: 'Distrito Fictício', churches: [], members: [] })
  })

  it('resume a lista fictícia por igreja, sem expor a edição dos membros', async () => {
    const user = await openReview()
    expect(screen.getByLabelText('Nome da igreja Igreja Fictícia')).toBeInTheDocument()
    expect(screen.getByText('1 membro(s) · 0 aniversário(s)')).toBeInTheDocument()
    expect(screen.getByText('Linhas não reconhecidas')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Nome 1|Aniversário 1/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar e organizar distrito' }))
    expect(await screen.findByRole('heading', { name: 'Distrito organizado' })).toBeInTheDocument()
    expect(screen.getByText('As igrejas, os membros e os aniversariantes encontrados foram cadastrados. Revise as informações das igrejas e complete o que estiver faltando.')).toBeInTheDocument()
    expect(setup.organize).toHaveBeenCalledTimes(1)
  })

  it('mostra processamento, bloqueia repetição e deixa o erro visível', async () => {
    let rejectImport: (reason: Error) => void = () => undefined
    setup.organize.mockImplementationOnce(() => new Promise((_, reject) => { rejectImport = reject }))
    const user = await openReview()
    await user.click(screen.getByRole('button', { name: 'Confirmar e organizar distrito' }))
    expect(screen.getByRole('button', { name: 'Organizando distrito…' })).toBeDisabled()
    expect(setup.organize).toHaveBeenCalledTimes(1)
    rejectImport(new Error('Não foi possível salvar os registros fictícios.'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar os registros fictícios.')
    expect(screen.getByRole('button', { name: 'Confirmar e organizar distrito' })).toBeEnabled()
  })
})
