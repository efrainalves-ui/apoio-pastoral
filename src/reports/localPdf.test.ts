import { describe, expect, it } from 'vitest'
import { buildLocalReportPdf } from './localPdf'
describe('relatório local',()=>{it('gera PDF sem dados confidenciais quando recebe apenas totais',()=>{const pdf=new TextDecoder().decode(buildLocalReportPdf('Visitações',['Pessoas visitadas: 2','Famílias visitadas: 1']));expect(pdf).toContain('%PDF-1.4');expect(pdf).not.toContain('oração')} )})
