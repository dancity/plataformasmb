import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Botao, Campo, Entrada, juntar } from './ui';

/**
 * Modal e diálogo de confirmação em três níveis.
 *
 * O nível `perigo` exige digitar o nome do item antes de habilitar o botão.
 * Não é fricção decorativa: é o que separa um clique acidental de uma ação
 * que ninguém desfaz — enviar o pedido do ano, reprovar uma unidade.
 */

export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = 'md',
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children?: ReactNode;
  rodape?: ReactNode;
  largura?: 'sm' | 'md' | 'lg';
}) {
  const idTitulo = useId();
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    caixa.current?.focus();
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  const LARGURA = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={juntar(
          'w-full rounded-2xl bg-white shadow-2xl focus:outline-none',
          LARGURA[largura],
        )}
      >
        <div className="flex flex-col gap-1.5 border-b border-gray-200 p-6 pb-4">
          <h2 id={idTitulo} className="text-lg font-semibold text-brand">
            {titulo}
          </h2>
          {descricao && <p className="text-sm text-gray-500">{descricao}</p>}
        </div>
        {children && <div className="flex flex-col gap-4 p-6">{children}</div>}
        {rodape && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 p-4">
            {rodape}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export type NivelConfirmacao = 'simples' | 'medio' | 'perigo';

export function DialogoConfirmacao({
  aberto,
  nivel = 'simples',
  titulo,
  descricao,
  detalhe,
  textoConfirmar,
  nomeParaDigitar,
  carregando,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean;
  nivel?: NivelConfirmacao;
  titulo: string;
  descricao: string;
  /** Resumo do que vai acontecer: números, contagens, o que muda. */
  detalhe?: ReactNode;
  textoConfirmar: string;
  /** Exigido no nível `perigo`: o texto que a pessoa precisa digitar. */
  nomeParaDigitar?: string;
  carregando?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const [digitado, setDigitado] = useState('');
  const [ciente, setCiente] = useState(false);

  useEffect(() => {
    if (aberto) {
      setDigitado('');
      setCiente(false);
    }
  }, [aberto]);

  const exigeDigitar = nivel === 'perigo' && !!nomeParaDigitar;
  const nomeConfere = !exigeDigitar || digitado.trim() === nomeParaDigitar?.trim();
  const exigeCiencia = nivel !== 'simples';
  const liberado = nomeConfere && (!exigeCiencia || ciente);

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoCancelar}
      titulo={titulo}
      descricao={descricao}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoCancelar} disabled={carregando}>
            Cancelar
          </Botao>
          <Botao
            variante={nivel === 'perigo' ? 'perigo' : 'primario'}
            onClick={aoConfirmar}
            disabled={!liberado}
            carregando={carregando}
          >
            {textoConfirmar}
          </Botao>
        </>
      }
    >
      {detalhe && (
        <div className="rounded-xl bg-gray-100 p-4 text-sm text-gray-700">{detalhe}</div>
      )}

      {exigeCiencia && (
        <label className="flex items-start gap-2.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={ciente}
            onChange={(e) => setCiente(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[var(--color-brand-medium)]"
          />
          <span>
            Estou ciente de que os valores são estimativas, calculadas sobre a previsão de alunos
            informada, e podem mudar com a matrícula efetiva.
          </span>
        </label>
      )}

      {exigeDigitar && (
        <Campo
          rotulo={`Digite ${nomeParaDigitar} para confirmar`}
          dica="A digitação existe para evitar clique acidental em algo que não se desfaz."
        >
          <Entrada
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            placeholder={nomeParaDigitar}
            autoComplete="off"
          />
        </Campo>
      )}
    </Modal>
  );
}
