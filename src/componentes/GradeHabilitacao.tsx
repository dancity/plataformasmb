import { Botao, juntar } from './ui';
import type { GradeHabilitacao as Grade } from '@/lib/dados';
import { ANOS_ESCOLARES, SEGMENTOS, anosDoSegmento } from '@dominio/anosEscolares';
import type { AnoEscolarId } from '@dominio/anosEscolares';
import type { Obrigatoriedade, Regional } from '@dominio/tipos';

/**
 * A grade regional × ano escolar. É o coração do cadastro: uma solução sem
 * nenhuma célula marcada não existe para ninguém.
 *
 * Três estados por célula, e a diferença entre eles é o que o gestor vai
 * ver na hora de escolher:
 *   vazio       — não é oferecido ali (vira explicação, não caixa desabilitada)
 *   opcional    — o gestor decide
 *   obrigatório — já vem marcado e travado
 *
 * O clique cicla entre os três. Ciclar é mais rápido que três controles por
 * célula quando são 102 células, e o rótulo em cada estado evita o adivinha.
 */

const PROXIMO: Record<Obrigatoriedade, Obrigatoriedade> = {
  indisponivel: 'opcional',
  opcional: 'obrigatorio',
  obrigatorio: 'indisponivel',
};

const ESTILO: Record<Obrigatoriedade, string> = {
  indisponivel: 'bg-white border-gray-200 text-gray-300 hover:border-gray-400',
  opcional: 'bg-blue-100 border-blue-300 text-blue-800',
  obrigatorio: 'bg-orange-100 border-orange-300 text-orange-800',
};

const SIMBOLO: Record<Obrigatoriedade, string> = {
  indisponivel: '–',
  opcional: '○',
  obrigatorio: '●',
};

const TITULO: Record<Obrigatoriedade, string> = {
  indisponivel: 'não oferecido',
  opcional: 'opcional',
  obrigatorio: 'obrigatório',
};

export function GradeHabilitacao({
  regionais,
  grade,
  aoMudar,
}: {
  regionais: readonly Regional[];
  grade: Grade;
  aoMudar: (grade: Grade) => void;
}) {
  const estado = (regionalId: string, ano: AnoEscolarId): Obrigatoriedade =>
    grade[regionalId]?.[ano] ?? 'indisponivel';

  function definir(regionalId: string, anos: readonly AnoEscolarId[], valor: Obrigatoriedade) {
    const nova: Grade = { ...grade, [regionalId]: { ...(grade[regionalId] ?? {}) } };
    for (const ano of anos) {
      const linha = nova[regionalId];
      if (!linha) continue;
      if (valor === 'indisponivel') delete linha[ano];
      else linha[ano] = valor;
    }
    aoMudar(nova);
  }

  function ciclar(regionalId: string, ano: AnoEscolarId) {
    definir(regionalId, [ano], PROXIMO[estado(regionalId, ano)]);
  }

  function alternarLinha(regionalId: string) {
    const anos = ANOS_ESCOLARES.map((a) => a.id);
    const todosMarcados = anos.every((a) => estado(regionalId, a) !== 'indisponivel');
    definir(regionalId, anos, todosMarcados ? 'indisponivel' : 'opcional');
  }

  const marcadas = regionais.reduce(
    (soma, r) => soma + ANOS_ESCOLARES.filter((a) => estado(r.id, a.id) !== 'indisponivel').length,
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className={juntar('h-4 w-4 rounded border text-center leading-[14px]', ESTILO.indisponivel)}>
              –
            </span>
            não oferecido
          </span>
          <span className="flex items-center gap-1.5">
            <span className={juntar('h-4 w-4 rounded border text-center leading-[14px]', ESTILO.opcional)}>
              ○
            </span>
            opcional
          </span>
          <span className="flex items-center gap-1.5">
            <span className={juntar('h-4 w-4 rounded border text-center leading-[14px]', ESTILO.obrigatorio)}>
              ●
            </span>
            obrigatório
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {marcadas === 0
            ? 'Nenhuma célula marcada — esta solução não apareceria para nenhuma unidade.'
            : `${marcadas} combinações habilitadas`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white p-2 text-left font-medium text-gray-500">
                Regional
              </th>
              {SEGMENTOS.map((seg) => (
                <th
                  key={seg.id}
                  colSpan={anosDoSegmento(seg.id).length}
                  className="border-b border-gray-200 px-2 pt-2 pb-1 text-[10px] font-medium tracking-wider text-gray-400 uppercase"
                >
                  {seg.nome}
                </th>
              ))}
              <th className="p-2" />
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-white p-1" />
              {ANOS_ESCOLARES.map((ano) => (
                <th
                  key={ano.id}
                  className="border-b border-gray-200 px-1 pb-1.5 text-[11px] font-normal text-gray-500"
                  title={ano.nome}
                >
                  {ano.curto}
                </th>
              ))}
              <th className="border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {regionais.map((regional) => (
              <tr key={regional.id} className="border-b border-gray-200 last:border-b-0">
                <th className="sticky left-0 z-10 bg-white p-2 text-left text-xs font-medium whitespace-nowrap text-gray-700">
                  {regional.nome}
                </th>
                {ANOS_ESCOLARES.map((ano) => {
                  const atual = estado(regional.id, ano.id);
                  return (
                    <td key={ano.id} className="p-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => ciclar(regional.id, ano.id)}
                        title={`${regional.nome} · ${ano.nome}: ${TITULO[atual]}`}
                        aria-label={`${regional.nome}, ${ano.nome}: ${TITULO[atual]}. Clique para mudar.`}
                        className={juntar(
                          'h-7 w-7 rounded border text-[11px] transition-colors',
                          ESTILO[atual],
                        )}
                      >
                        {SIMBOLO[atual]}
                      </button>
                    </td>
                  );
                })}
                <td className="px-2 whitespace-nowrap">
                  <Botao
                    type="button"
                    variante="fantasma"
                    tamanho="sm"
                    onClick={() => alternarLinha(regional.id)}
                  >
                    tudo
                  </Botao>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Marcar segmento em todas as regionais:</span>
        {SEGMENTOS.map((seg) => (
          <Botao
            key={seg.id}
            type="button"
            variante="secundario"
            tamanho="sm"
            onClick={() => {
              const anos = anosDoSegmento(seg.id).map((a) => a.id);
              const cheio = regionais.every((r) =>
                anos.every((a) => estado(r.id, a) !== 'indisponivel'),
              );
              let nova = grade;
              for (const r of regionais) {
                const linha = { ...(nova[r.id] ?? {}) };
                for (const ano of anos) {
                  if (cheio) delete linha[ano];
                  else linha[ano] = 'opcional';
                }
                nova = { ...nova, [r.id]: linha };
              }
              aoMudar(nova);
            }}
          >
            {seg.nome}
          </Botao>
        ))}
      </div>
    </div>
  );
}
