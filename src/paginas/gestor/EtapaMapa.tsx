import { useMemo, useState } from 'react';
import { DialogoConfirmacao } from '@/componentes/Modal';
import { Botao, Cartao, EstadoVazio, Selo } from '@/componentes/ui';
import type { Sessao } from '@/lib/auth';
import { calcularLinhas, somarTotais } from '@/lib/pedido';
import type { ContextoPedido, EscritorPedido, LinhaCalculada } from '@/lib/pedido';
import { descreverAnos } from '@dominio/anosEscolares';
import { formatarBRL } from '@dominio/preco';
import { CATEGORIA_AVALIACAO_LARGA_ESCALA } from '@dominio/tipos';

/**
 * Etapa 4 — o mapa da contratação.
 *
 * De propósito, limpo: o que está sendo contratado, em palavras, sem preço
 * por linha nem grade de anos — quem quer mais detalhe volta e navega pelas
 * etapas anteriores. O único número grande é o resumo do orçamento, no
 * final.
 */
export function EtapaMapa({
  ctx,
  sessao,
  somenteLeitura,
  escritor,
  aoVoltar,
  aoIrParaModelo,
  aoSalvar,
}: {
  ctx: ContextoPedido;
  sessao: Sessao;
  somenteLeitura: boolean;
  escritor: EscritorPedido;
  aoVoltar: () => void;
  aoIrParaModelo: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const linhas = useMemo(
    () => calcularLinhas(ctx, sessao.regionalId ?? ''),
    [ctx, sessao.regionalId],
  );
  const totais = useMemo(() => somarTotais(linhas), [linhas]);

  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const contratadas = linhas.filter((l) => (l.item?.anosSelecionados.length ?? 0) > 0);
  const pendentes = linhas.filter((l) => !l.decidida);
  const pendentesModelo = pendentes.filter(
    (l) => l.produto.categoria === CATEGORIA_AVALIACAO_LARGA_ESCALA,
  );
  const pendentesEscolha = pendentes.filter(
    (l) => l.produto.categoria !== CATEGORIA_AVALIACAO_LARGA_ESCALA,
  );

  // Agrupa o que veio de modelo pelo modelo de origem — é o pacote que a
  // unidade adotou, não soluções soltas.
  const porModelo = useMemo(() => {
    const grupos = new Map<string, { nome: string; linhas: LinhaCalculada[] }>();
    for (const l of contratadas) {
      const id = l.item?.origemModeloId;
      if (!id) continue;
      if (!grupos.has(id)) grupos.set(id, { nome: l.item?.origemModeloNome ?? 'Modelo', linhas: [] });
      grupos.get(id)!.linhas.push(l);
    }
    return [...grupos.values()];
  }, [contratadas]);

  const adicionais = contratadas.filter((l) => !l.item?.origemModeloId);

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      await escritor.enviarPedido(ctx.ciclo.id);
      await aoSalvar();
    } catch (e) {
      const codigo = (e as { code?: string }).code ?? '';
      const mensagem = (e as { message?: string }).message ?? '';
      setErro(
        codigo === 'functions/not-found' || codigo === 'functions/internal'
          ? 'O envio ainda não está disponível: as funções do servidor não foram publicadas. Sua escolha está salva — nada se perdeu.'
          : mensagem || 'Não foi possível enviar o pedido. Tente de novo.',
      );
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  const enviado = !!ctx.pedido && ctx.pedido.estado !== 'rascunho' && ctx.pedido.estado !== 'devolvido';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-brand">Mapa da contratação {ctx.ciclo.anoAlvo}</h2>
        <p className="max-w-prose text-sm text-gray-500">
          O que está sendo contratado. Pra ver preço e anos escolares linha a linha, volte às
          etapas anteriores — aqui é só a conferência final, antes do envio.
        </p>
      </div>

      {contratadas.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">📭</span>}
          titulo="Nada contratado ainda"
          descricao="Volte às etapas anteriores para adotar um modelo ou escolher soluções adicionais."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {porModelo.map((grupo) => (
            <Cartao key={grupo.nome} className="gap-2 p-5">
              <span className="font-mono text-[11px] tracking-wider text-gray-500 uppercase">
                Modelo adotado
              </span>
              <h3 className="text-base font-semibold text-brand">{grupo.nome}</h3>
              <ul className="flex flex-col gap-1.5">
                {grupo.linhas.map((l) => (
                  <li
                    key={l.produto.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                  >
                    <span className="text-gray-700">{l.produto.nome}</span>
                    <span className="text-xs text-gray-500">
                      {descreverAnos(l.item?.anosSelecionados ?? [])}
                    </span>
                  </li>
                ))}
              </ul>
            </Cartao>
          ))}

          {adicionais.length > 0 && (
            <Cartao className="gap-2 p-5">
              <span className="font-mono text-[11px] tracking-wider text-gray-500 uppercase">
                Soluções adicionais
              </span>
              <ul className="flex flex-col gap-1.5">
                {adicionais.map((l) => (
                  <li
                    key={l.produto.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                  >
                    <span className="flex flex-wrap items-center gap-1.5 text-gray-700">
                      {l.produto.nome}
                      {l.habilitacao.obrigatorios.length > 0 && <Selo tom="marca">obrigatória</Selo>}
                    </span>
                    <span className="text-xs text-gray-500">
                      {l.habilitacao.preco.base === 'escola'
                        ? 'toda a unidade'
                        : descreverAnos(l.item?.anosSelecionados ?? [])}
                    </span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>
      )}

      {pendentesModelo.length > 0 && !somenteLeitura && (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          Falta decidir: {pendentesModelo.map((l) => l.produto.nome).join(', ')}. Adote um modelo
          que cubra essas avaliações —{' '}
          <button type="button" onClick={aoIrParaModelo} className="underline">
            ir para o modelo
          </button>
          .
        </p>
      )}

      {pendentesEscolha.length > 0 && !somenteLeitura && (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          Faltam decisões em: {pendentesEscolha.map((l) => l.produto.nome).join(', ')}. Volte às
          soluções adicionais e marque os anos ou diga que não vai contratar — caixa vazia não diz
          se você recusou ou se ainda não olhou.
        </p>
      )}

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      <Cartao className="flex-row flex-wrap items-center gap-5 p-4">
        <div className="flex flex-col">
          <span className="text-xs tracking-wide text-gray-500 uppercase">
            Total estimado {ctx.ciclo.anoAlvo}
          </span>
          <span className="font-mono text-xl font-semibold text-brand tabular-nums">
            {formatarBRL(totais.total)}
          </span>
        </div>

        <div className="flex-1" />

        {enviado ? (
          <Selo tom="concluido">enviado para a regional</Selo>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoVoltar}>
              Voltar às soluções adicionais
            </Botao>
            <Botao
              onClick={() => setConfirmando(true)}
              disabled={somenteLeitura || pendentes.length > 0 || totais.total === 0}
            >
              Enviar pedido
            </Botao>
          </>
        )}
      </Cartao>

      <p className="text-xs text-gray-500">
        Os valores são estimativas calculadas sobre a previsão de alunos informada e serão
        ajustados pela matrícula efetiva.
      </p>

      <DialogoConfirmacao
        aberto={confirmando}
        nivel="perigo"
        titulo="Enviar o pedido para a regional"
        descricao="Depois do envio o pedido sai da sua mão: só volta a ser editável se a regional devolver para ajuste."
        detalhe={
          <ul className="flex flex-col gap-1">
            <li>
              <strong>{contratadas.length}</strong> soluções contratadas
            </li>
            <li>
              Total estimado: <strong>{formatarBRL(totais.total)}</strong> por ano
            </li>
            <li>Unidade: {ctx.unidade.nome}</li>
          </ul>
        }
        textoConfirmar="Enviar pedido"
        nomeParaDigitar={ctx.unidade.nome}
        carregando={enviando}
        aoCancelar={() => setConfirmando(false)}
        aoConfirmar={() => void enviar()}
      />
    </div>
  );
}
