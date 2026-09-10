import type { Mantenedora, TipoUnidade } from '@dominio/tipos';
import { REGIONAIS_PADRAO, type UnidadeParaImportar } from './dados';
import { slugificar } from './slug';

const MANTENEDORAS_VALIDAS = new Set<Mantenedora>(['ABEC', 'SOME', 'UBEE', 'UNBEC']);

function acharRegionalPorNome(texto: string): string | null {
  const alvo = slugificar(texto);
  return REGIONAIS_PADRAO.find((r) => slugificar(r.nome) === alvo)?.id ?? null;
}

function acharTipo(texto: string): TipoUnidade | null {
  const t = texto.trim().toLowerCase();
  if (t.startsWith('pag')) return 'paga';
  if (t.startsWith('soc')) return 'social';
  return null;
}

function acharMantenedora(texto: string): Mantenedora | null {
  const m = texto.trim().toUpperCase();
  return MANTENEDORAS_VALIDAS.has(m as Mantenedora) ? (m as Mantenedora) : null;
}

interface LinhaAnalisada {
  nome: string;
  codigo: string;
  mantenedora: Mantenedora | null;
  regionalId: string | null;
  tipo: TipoUnidade | null;
}

export interface ResultadoImportacao {
  /** Só as linhas totalmente reconhecidas — prontas pra importar. */
  prontas: UnidadeParaImportar[];
  /** Uma mensagem por problema encontrado, pra revisão antes de confirmar. */
  erros: string[];
}

/**
 * Lê texto colado direto do Excel: colunas `Unidade`, `Mantenedora`,
 * `Regional`, `Pago | Social`, separadas por tab (vírgula como alternativa).
 * A mesma unidade costuma repetir uma linha por ano escolar — aqui ela
 * colapsa numa só; se os dados divergirem entre as repetições, isso vira
 * erro em vez de decidido em silêncio.
 */
export function analisarColagem(texto: string): ResultadoImportacao {
  const porNome = new Map<string, LinhaAnalisada>();
  const inconsistentes = new Set<string>();
  const erros: string[] = [];

  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const linhaTexto of linhas) {
    const colunas = (linhaTexto.includes('\t') ? linhaTexto.split('\t') : linhaTexto.split(','))
      .map((c) => c.trim());
    if (colunas.length < 4) continue;
    const [nome = '', mantenedoraBruta = '', regionalBruta = '', tipoBruto = ''] = colunas;
    if (!nome || /^unidade$/i.test(nome)) continue; // vazia ou cabeçalho

    const linha: LinhaAnalisada = {
      nome,
      codigo: slugificar(nome),
      mantenedora: acharMantenedora(mantenedoraBruta),
      regionalId: acharRegionalPorNome(regionalBruta),
      tipo: acharTipo(tipoBruto),
    };

    const existente = porNome.get(nome);
    if (!existente) {
      porNome.set(nome, linha);
      continue;
    }
    const igual =
      existente.mantenedora === linha.mantenedora &&
      existente.regionalId === linha.regionalId &&
      existente.tipo === linha.tipo;
    if (!igual) {
      inconsistentes.add(nome);
      erros.push(`"${nome}" aparece com dados diferentes em mais de uma linha.`);
    }
  }

  const prontas: UnidadeParaImportar[] = [];
  for (const linha of porNome.values()) {
    if (inconsistentes.has(linha.nome)) continue; // já virou erro acima; dado ambíguo não entra
    if (!linha.mantenedora) erros.push(`"${linha.nome}": mantenedora não reconhecida.`);
    if (!linha.regionalId) erros.push(`"${linha.nome}": regional não reconhecida.`);
    if (!linha.tipo) erros.push(`"${linha.nome}": tipo (pago ou social) não reconhecido.`);
    if (linha.mantenedora && linha.regionalId && linha.tipo) {
      prontas.push({
        nome: linha.nome,
        codigo: linha.codigo,
        regionalId: linha.regionalId,
        tipo: linha.tipo,
        mantenedora: linha.mantenedora,
      });
    }
  }

  return { prontas, erros };
}
