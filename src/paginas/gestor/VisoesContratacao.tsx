import { useMemo } from 'react';
import { Selo, juntar } from '@/componentes/ui';
import type { LinhaCalculada } from '@/lib/pedido';
import { ANOS_ESCOLARES, anoEscolar, descreverAnos, ordenarAnos } from '@dominio/anosEscolares';
import type { AnoEscolarId, PrevisaoPorAno } from '@dominio/anosEscolares';
import { formatarBRL } from '@dominio/preco';

/**
 * As duas leituras do que a unidade está contratando.
 *
 * Cards por ano escolar respondem "o que cada série recebe" — é a pergunta de
 * quem coordena o ano letivo. A lista responde "o que foi contratado, quanto
 * custa" — é a pergunta de quem assina. Mesmos dados, dois recortes; nenhum
 * deles é resumo do outro.
 */

export type Visao = 'cards' | 'lista';

/** Uma solução contratada, já achatada pro que as duas visões precisam. */
export interface Contratada {
  id: string;
  nome: string;
  /** Nome do modelo de origem, ou null quando foi escolha avulsa. */
  modelo: string | null;
  obrigatoria: boolean;
  /** Cobrança por unidade: não pertence a um ano escolar específico. */
  porUnidade: boolean;
  anos: AnoEscolarId[];
  licencasPorAno: PrevisaoPorAno;
  licencas: number;
  creditosPorAno?: PrevisaoPorAno;
  creditos: number;
  valorAnual: number;
}

export function montarContratadas(linhas: readonly LinhaCalculada[]): Contratada[] {
  return linhas
    .filter((l) => (l.item?.anosSelecionados.length ?? 0) > 0)
    .map((l) => {
      const item = l.item!;
      const creditosPorAno = item.creditosPorAno;
      return {
        id: l.produto.id,
        nome: l.produto.nome,
        modelo: item.origemModeloNome ?? null,
        obrigatoria: l.habilitacao.obrigatorios.length > 0,
        porUnidade: l.habilitacao.preco.base === 'escola',
        anos: ordenarAnos(item.anosSelecionados),
        licencasPorAno: item.alunosPorAno,
        licencas: item.alunosTotal,
        creditosPorAno,
        creditos: creditosPorAno
          ? item.anosSelecionados.reduce((s, a) => s + (creditosPorAno[a] ?? 0), 0)
          : 0,
        valorAnual: item.valorAnual,
      };
    });
}

// ─── Alternador ──────────────────────────────────────────────────

export function AlternadorVisao({
  visao,
  aoMudar,
}: {
  visao: Visao;
  aoMudar: (v: Visao) => void;
}) {
  const opcoes = [
    { id: 'cards' as const, rotulo: 'Por ano escolar' },
    { id: 'lista' as const, rotulo: 'Lista' },
  ];
  return (
    <div
      role="group"
      aria-label="Como ver a contratação"
      className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5"
    >
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => aoMudar(o.id)}
          aria-pressed={visao === o.id}
          className={juntar(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            visao === o.id ? 'bg-brand-medium text-white' : 'text-gray-600 hover:bg-gray-100',
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/**
 * Origem é sinal, não enfeite: ponto cheio veio de modelo, ponto vazado é
 * escolha avulsa. A forma carrega o sentido sozinha — quem não distingue as
 * cores lê a mesma coisa.
 */
function PontoOrigem({ deModelo, className }: { deModelo: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={juntar(
        'h-2 w-2 shrink-0 rounded-full',
        deModelo ? 'bg-brand-medium' : 'border border-gray-400',
        className,
      )}
    />
  );
}

export function LegendaOrigem({ modelos }: { modelos: readonly string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
      {modelos.length > 0 && (
        <span className="flex items-center gap-1.5">
          <PontoOrigem deModelo />
          {modelos.join(' · ')}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <PontoOrigem deModelo={false} />
        soluções adicionais
      </span>
    </div>
  );
}

/** O número que importa naquele ano: crédito quando há, licença quando não. */
function medidaDoAno(c: Contratada, ano: AnoEscolarId): { numero: number; rotulo: string } {
  const creditos = c.creditosPorAno?.[ano];
  if (creditos !== undefined) return { numero: creditos, rotulo: 'créditos' };
  return { numero: c.licencasPorAno[ano] ?? 0, rotulo: 'licenças' };
}

// ─── Visão em cards, uma coluna por ano escolar ──────────────────

export function VisaoCards({
  contratadas,
  previsao,
}: {
  contratadas: readonly Contratada[];
  previsao: PrevisaoPorAno;
}) {
  const porAno = contratadas.filter((c) => !c.porUnidade);
  const daUnidade = contratadas.filter((c) => c.porUnidade);

  // Só os anos que de fato recebem alguma coisa — coluna vazia é ruído, e
  // cada coluna a menos é largura que sobra pras que importam.
  const colunas = useMemo(() => {
    const comAlgo = new Set<AnoEscolarId>();
    for (const c of porAno) for (const a of c.anos) comAlgo.add(a);
    return ANOS_ESCOLARES.filter((a) => comAlgo.has(a.id)).map((a) => a.id);
  }, [porAno]);

  return (
    <div className="flex flex-col gap-3">
      {daUnidade.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <span className="font-mono text-[11px] tracking-wider text-gray-500 uppercase">
            Toda a unidade
          </span>
          {daUnidade.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700"
            >
              <PontoOrigem deModelo={!!c.modelo} />
              {c.nome}
            </span>
          ))}
        </div>
      )}

      {colunas.length > 0 && (
        <div className="overflow-x-auto pb-1">
          {/* As colunas dividem a largura disponível em partes iguais, então
              o normal é caber tudo sem rolar. O `minWidth` é só o piso de
              legibilidade: abaixo dele — muitos anos, tela estreita — aí sim
              rola de lado, em vez de espremer o nome até virar ilegível. */}
          <div
            className="grid items-start gap-1"
            style={{
              gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))`,
              minWidth: `${colunas.length * 4.75}rem`,
            }}
          >
            {colunas.map((ano) => {
              const doAno = porAno.filter((c) => c.anos.includes(ano));
              return (
                <div key={ano} className="flex flex-col gap-1.5">
                  <div className="rounded-lg bg-gray-100 px-1 py-1.5 text-center">
                    <span className="block text-sm font-semibold text-brand">
                      {anoEscolar(ano).curto}
                    </span>
                    <span className="block font-mono text-[10px] text-gray-500 tabular-nums">
                      {previsao[ano] ?? 0} alunos
                    </span>
                  </div>

                  {doAno.map((c) => {
                    const { numero, rotulo } = medidaDoAno(c, ano);
                    return (
                      <div
                        key={c.id}
                        title={`${c.nome} — ${numero} ${rotulo}${c.modelo ? ` · ${c.modelo}` : ''}`}
                        className="flex flex-col gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-1.5"
                      >
                        {/* Coluna estreita é o preço de caber tudo numa tela:
                            o nome usa a mesma escala densa dos números. Nome
                            comprido ainda pode quebrar — daí o title e a
                            visão em lista, onde ele aparece inteiro. */}
                        <span className="text-[10px] leading-[1.25] break-words hyphens-auto text-gray-700">
                          {c.nome}
                        </span>
                        <span className="flex items-center justify-between gap-1">
                          <PontoOrigem deModelo={!!c.modelo} />
                          <span className="font-mono text-[10px] text-gray-400 tabular-nums">
                            {numero}
                          </span>
                        </span>
                        <span className="sr-only">
                          {numero} {rotulo}
                          {c.modelo ? `, do modelo ${c.modelo}` : ', solução adicional'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Visão em lista ──────────────────────────────────────────────

/** Agrupa por origem: o pacote de cada modelo, depois o que a unidade
 *  escolheu sozinha. Repetir o nome do modelo em toda linha só ocupava
 *  coluna — como título de grupo ele conta a mesma coisa uma vez só. */
function agruparPorOrigem(contratadas: readonly Contratada[]) {
  const grupos = new Map<string, { titulo: string; deModelo: boolean; itens: Contratada[] }>();
  for (const c of contratadas) {
    const chave = c.modelo ?? '';
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        titulo: c.modelo ?? 'Escolhas da unidade',
        deModelo: !!c.modelo,
        itens: [],
      });
    }
    grupos.get(chave)!.itens.push(c);
  }
  // Modelo primeiro: é o pacote fechado, a base sobre a qual o resto se soma.
  return [...grupos.values()].sort((a, b) => Number(b.deModelo) - Number(a.deModelo));
}

export function VisaoLista({ contratadas }: { contratadas: readonly Contratada[] }) {
  const grupos = useMemo(() => agruparPorOrigem(contratadas), [contratadas]);
  const total = contratadas.reduce((s, c) => s + c.valorAnual, 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-[11px] tracking-wider text-gray-500 uppercase">
            <th className="px-3 py-2.5 text-left font-medium sm:px-4">Solução</th>
            {/* Em tela estreita os anos descem pra dentro do nome: é a coluna
                mais larga e a menos decisiva aqui — quem quer ler por ano
                escolar tem a outra visão inteira pra isso. */}
            <th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">
              Anos escolares
            </th>
            <th className="px-2 py-2.5 text-right font-medium sm:px-3">Licenças</th>
            <th className="px-3 py-2.5 text-right font-medium sm:px-4">Valor anual</th>
          </tr>
        </thead>

        {grupos.map((grupo) => {
          const somaGrupo = grupo.itens.reduce((s, c) => s + c.valorAnual, 0);
          return (
            <tbody key={grupo.titulo}>
              {/* Uma célula só, com flex por dentro: assim o cabeçalho do
                  grupo não depende de quantas colunas estão visíveis. */}
              <tr className="border-b border-gray-200 bg-gray-50">
                <th colSpan={4} className="px-3 py-2 text-left sm:px-4">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <PontoOrigem deModelo={grupo.deModelo} />
                    <span className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
                      {grupo.titulo}
                    </span>
                    <span className="text-xs font-normal text-gray-400">
                      {grupo.itens.length} soluç{grupo.itens.length === 1 ? 'ão' : 'ões'}
                    </span>
                    <span className="flex-1" />
                    <span className="font-mono text-xs font-medium text-gray-500 tabular-nums">
                      {formatarBRL(somaGrupo)}
                    </span>
                  </span>
                </th>
              </tr>

              {grupo.itens.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50"
                >
                  <td className="py-2.5 pr-3 pl-6 sm:pr-4 sm:pl-8">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-gray-700">{c.nome}</span>
                      {c.obrigatoria && <Selo tom="marca">obrigatória</Selo>}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500 md:hidden">
                      {c.porUnidade ? 'toda a unidade' : descreverAnos(c.anos)}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-gray-500 md:table-cell">
                    {c.porUnidade ? 'toda a unidade' : descreverAnos(c.anos)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs whitespace-nowrap text-gray-600 tabular-nums sm:px-3">
                    {c.creditos > 0 ? `${c.creditos} créd.` : c.porUnidade ? '—' : c.licencas}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap text-gray-700 tabular-nums sm:px-4">
                    {formatarBRL(c.valorAnual)}
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}

        <tfoot>
          <tr className="border-t-2 border-gray-200">
            <td colSpan={4} className="px-3 py-3 sm:px-4">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium text-gray-700">
                  {contratadas.length} soluç{contratadas.length === 1 ? 'ão' : 'ões'} contratadas
                </span>
                <span className="flex-1" />
                <span className="font-mono font-semibold text-brand tabular-nums">
                  {formatarBRL(total)}
                </span>
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
