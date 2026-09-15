import { Botao, juntar } from './ui';
import { ANOS_ESCOLARES, SEGMENTOS, anosDoSegmento } from '@dominio/anosEscolares';
import type { AnoEscolarId } from '@dominio/anosEscolares';
import type { HabilitacaoPorAno, Obrigatoriedade } from '@dominio/tipos';

/**
 * Em quais anos escolares a solução é oferecida. É o coração do cadastro:
 * uma solução sem nenhum ano marcado não existe para ninguém.
 *
 * Três estados por ano, e a diferença entre eles é o que o gestor vai ver na
 * hora de escolher:
 *   não oferecido — não aparece na tela dele
 *   opcional      — ele decide
 *   obrigatório   — já vem marcado e travado
 *
 * O clique cicla entre os três: é mais rápido que três controles por ano, e
 * o símbolo em cada estado evita depender da cor pra ler o que está marcado.
 */

const PROXIMO: Record<Obrigatoriedade, Obrigatoriedade> = {
  indisponivel: 'opcional',
  opcional: 'obrigatorio',
  obrigatorio: 'indisponivel',
};

const ESTILO: Record<Obrigatoriedade, string> = {
  indisponivel: 'bg-white border-gray-200 text-gray-400 hover:border-gray-400',
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

function Amostra({ estado }: { estado: Obrigatoriedade }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={juntar('h-4 w-4 rounded border text-center leading-[14px]', ESTILO[estado])}
      >
        {SIMBOLO[estado]}
      </span>
      {TITULO[estado]}
    </span>
  );
}

export function HabilitacaoAnos({
  habilitacao,
  aoMudar,
}: {
  habilitacao: HabilitacaoPorAno;
  aoMudar: (h: HabilitacaoPorAno) => void;
}) {
  const estado = (ano: AnoEscolarId): Obrigatoriedade => habilitacao[ano] ?? 'indisponivel';

  function definir(anos: readonly AnoEscolarId[], valor: Obrigatoriedade) {
    const nova: HabilitacaoPorAno = { ...habilitacao };
    // Ausência da chave É o estado "não oferecido" — desmarcar apaga em vez
    // de gravar um terceiro valor, senão o documento acumula lixo.
    for (const ano of anos) {
      if (valor === 'indisponivel') delete nova[ano];
      else nova[ano] = valor;
    }
    aoMudar(nova);
  }

  const marcados = ANOS_ESCOLARES.filter((a) => estado(a.id) !== 'indisponivel');
  const obrigatorios = marcados.filter((a) => estado(a.id) === 'obrigatorio');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
        <Amostra estado="indisponivel" />
        <Amostra estado="opcional" />
        <Amostra estado="obrigatorio" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {SEGMENTOS.map((seg) => {
          const anos = anosDoSegmento(seg.id).map((a) => a.id);
          const cheio = anos.every((a) => estado(a) !== 'indisponivel');
          return (
            <div
              key={seg.id}
              className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                  {seg.nome}
                </span>
                <Botao
                  type="button"
                  variante="fantasma"
                  tamanho="sm"
                  onClick={() => definir(anos, cheio ? 'indisponivel' : 'opcional')}
                >
                  {cheio ? 'limpar' : 'todo o segmento'}
                </Botao>
              </div>
              <div className="flex flex-wrap gap-1">
                {anosDoSegmento(seg.id).map((ano) => {
                  const atual = estado(ano.id);
                  return (
                    <button
                      key={ano.id}
                      type="button"
                      onClick={() => definir([ano.id], PROXIMO[atual])}
                      title={`${ano.nome}: ${TITULO[atual]}`}
                      aria-label={`${ano.nome}: ${TITULO[atual]}. Clique para mudar.`}
                      className={juntar(
                        'flex h-9 min-w-11 items-center justify-center gap-1 rounded-lg border px-2 text-xs transition-colors',
                        ESTILO[atual],
                      )}
                    >
                      <span>{ano.curto}</span>
                      <span aria-hidden="true" className="text-[10px]">
                        {SIMBOLO[atual]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p
        className={juntar(
          'text-xs',
          marcados.length === 0 ? 'text-amber-700' : 'text-gray-500',
        )}
      >
        {marcados.length === 0
          ? 'Nenhum ano marcado — esta solução não apareceria para nenhuma unidade.'
          : `${marcados.length} ano(s) habilitado(s)${
              obrigatorios.length > 0 ? `, ${obrigatorios.length} obrigatório(s)` : ''
            }.`}
      </p>
    </div>
  );
}
