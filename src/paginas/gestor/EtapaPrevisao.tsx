import { useMemo, useState } from 'react';
import { Botao, Cartao, Entrada, Selo } from '@/componentes/ui';
import type { Sessao } from '@/lib/auth';
import type { ContextoPedido, EscritorPedido } from '@/lib/pedido';
import { SEGMENTOS, anosDoSegmento, totalDeAlunos } from '@dominio/anosEscolares';
import type { AnoEscolarId, PrevisaoPorAno } from '@dominio/anosEscolares';

/**
 * Etapa 1 — previsão de alunos por ano escolar.
 *
 * É a etapa que o desenho original não tinha e sem a qual nenhum preço por
 * aluno fecha: "R$ 15 por aluno" não é preço enquanto ninguém disser quantos
 * alunos. Se a administração já carregou uma previsão, os campos chegam
 * preenchidos e o gestor só confirma.
 */
export function EtapaPrevisao({
  ctx,
  sessao,
  somenteLeitura,
  escritor,
  aoAvancar,
  aoSalvar,
}: {
  ctx: ContextoPedido;
  sessao: Sessao;
  somenteLeitura: boolean;
  escritor: EscritorPedido;
  aoAvancar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const original = ctx.previsao;
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const seg of SEGMENTOS) {
      for (const ano of anosDoSegmento(seg.id)) {
        const n = original[ano.id];
        inicial[ano.id] = n ? String(n) : '';
      }
    }
    return inicial;
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const previsao = useMemo<PrevisaoPorAno>(() => {
    const p: PrevisaoPorAno = {};
    for (const [ano, texto] of Object.entries(valores)) {
      const n = Number(texto);
      if (Number.isFinite(n) && n > 0) p[ano as AnoEscolarId] = Math.round(n);
    }
    return p;
  }, [valores]);

  const total = totalDeAlunos(previsao);
  const vazio = total === 0;

  async function salvar(confirmando: boolean) {
    setSalvando(true);
    setErro(null);
    try {
      await escritor.salvarPrevisao(ctx.ciclo, sessao, previsao, confirmando);
      await aoSalvar();
      if (confirmando) aoAvancar();
    } catch {
      setErro('Não foi possível salvar a previsão. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-brand">
          Quantos alunos sua unidade terá em {ctx.ciclo.anoAlvo}?
        </h2>
        <p className="max-w-prose text-sm text-gray-500">
          É a base de todo o cálculo: soluções cobradas por aluno usam estes números. Não precisa
          ser exato — é uma projeção, e o valor final será ajustado pela matrícula efetiva. Deixe
          em branco os anos que a unidade não vai ofertar.
          {ctx.previsaoConfirmada && ' Você já confirmou esta previsão; pode ajustar se mudou algo.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SEGMENTOS.map((seg) => {
          const anos = anosDoSegmento(seg.id);
          const subtotal = anos.reduce((s, a) => s + (previsao[a.id] ?? 0), 0);
          return (
            <Cartao key={seg.id} className="gap-3 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-brand">{seg.nome}</h3>
                <span className="font-mono text-xs text-gray-500 tabular-nums">
                  {subtotal} aluno{subtotal === 1 ? '' : 's'}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {anos.map((ano) => {
                  const mudou =
                    ctx.previsao[ano.id] !== undefined &&
                    String(ctx.previsao[ano.id]) !== (valores[ano.id] ?? '');
                  return (
                    <label key={ano.id} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-sm text-gray-700">{ano.nome}</span>
                      <Entrada
                        type="number"
                        min={0}
                        inputMode="numeric"
                        disabled={somenteLeitura}
                        value={valores[ano.id] ?? ''}
                        onChange={(e) =>
                          setValores((v) => ({ ...v, [ano.id]: e.target.value }))
                        }
                        placeholder="—"
                        className="max-w-24"
                        aria-label={`Alunos em ${ano.nome}`}
                      />
                      {mudou && (
                        <span className="text-xs text-gray-500">
                          era {ctx.previsao[ano.id]}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </Cartao>
          );
        })}
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      <Cartao className="flex-row flex-wrap items-center gap-4 p-4">
        <div className="flex flex-col">
          <span className="text-xs tracking-wide text-gray-500 uppercase">Total da unidade</span>
          <span className="font-mono text-xl font-semibold text-brand tabular-nums">
            {total} alunos
          </span>
        </div>
        {ctx.previsaoConfirmada && <Selo tom="ok">confirmada</Selo>}
        <div className="flex-1" />
        {!somenteLeitura && (
          <>
            <Botao variante="secundario" carregando={salvando} onClick={() => void salvar(false)}>
              Salvar e continuar depois
            </Botao>
            <Botao carregando={salvando} disabled={vazio} onClick={() => void salvar(true)}>
              Confirmar e escolher soluções
            </Botao>
          </>
        )}
        {somenteLeitura && (
          <Botao variante="secundario" onClick={aoAvancar}>
            Ver as soluções
          </Botao>
        )}
      </Cartao>

      {vazio && !somenteLeitura && (
        <p className="text-xs text-gray-500">
          Preencha ao menos um ano escolar para seguir — sem alunos não há o que contratar.
        </p>
      )}
    </div>
  );
}
