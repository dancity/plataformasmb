import { useMemo, useState } from 'react';
import { DialogoConfirmacao } from '@/componentes/Modal';
import { Botao, Cartao, EstadoVazio, Selo } from '@/componentes/ui';
import type { Sessao } from '@/lib/auth';
import { calcularLinhas, somarTotais } from '@/lib/pedido';
import type { ContextoPedido, EscritorPedido } from '@/lib/pedido';
import { formatarBRL } from '@dominio/preco';
import { CATEGORIA_AVALIACAO_LARGA_ESCALA } from '@dominio/tipos';
import {
  AlternadorVisao,
  LegendaOrigem,
  VisaoCards,
  VisaoLista,
  montarContratadas,
} from './VisoesContratacao';
import type { Visao } from './VisoesContratacao';

/**
 * Etapa 4 — o mapa da contratação.
 *
 * Duas leituras do mesmo pedido: por ano escolar, pra quem coordena o ano
 * letivo, e em lista, pra quem assina. O único número grande é o total, no
 * final.
 */
export function EtapaMapa({
  ctx,
  sessao,
  somenteLeitura,
  escritor,
  aoVoltar,
  aoSalvar,
}: {
  ctx: ContextoPedido;
  sessao: Sessao;
  somenteLeitura: boolean;
  escritor: EscritorPedido;
  aoVoltar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const linhas = useMemo(
    () => calcularLinhas(ctx),
    [ctx, sessao.regionalId],
  );
  const totais = useMemo(() => somarTotais(linhas), [linhas]);

  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [visao, setVisao] = useState<Visao>('cards');

  const contratadas = useMemo(() => montarContratadas(linhas), [linhas]);
  const modelosAdotados = useMemo(
    () => [...new Set(contratadas.map((c) => c.modelo).filter((m): m is string => !!m))],
    [contratadas],
  );

  // Avaliação em larga escala só entra por modelo, nunca uma a uma. Se um
  // modelo não cobre alguma, não há decisão a cobrar da unidade: adotar o
  // modelo já é a decisão inteira. Por isso a categoria fica fora das
  // pendências — nem aviso, nem trava no envio.
  const pendentes = linhas.filter(
    (l) => !l.decidida && l.produto.categoria !== CATEGORIA_AVALIACAO_LARGA_ESCALA,
  );

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
          A conferência final antes do envio. Veja por ano escolar o que cada série recebe, ou em
          lista o que foi contratado e quanto custa.
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LegendaOrigem modelos={modelosAdotados} />
            <AlternadorVisao visao={visao} aoMudar={setVisao} />
          </div>

          {visao === 'cards' ? (
            <VisaoCards contratadas={contratadas} previsao={ctx.previsao} />
          ) : (
            <VisaoLista contratadas={contratadas} />
          )}
        </div>
      )}

      {pendentes.length > 0 && !somenteLeitura && (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          Faltam decisões em: {pendentes.map((l) => l.produto.nome).join(', ')}. Volte às soluções
          adicionais e marque os anos ou diga que não vai contratar — caixa vazia não diz se você
          recusou ou se ainda não olhou.
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
        textoCiencia="Estou ciente de que os valores são estimativas, calculadas sobre a previsão de alunos informada, e podem mudar com a matrícula efetiva."
        textoParaDigitar="Estou ciente"
        carregando={enviando}
        aoCancelar={() => setConfirmando(false)}
        aoConfirmar={() => void enviar()}
      />
    </div>
  );
}
