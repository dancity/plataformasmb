import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useTema } from '@/lib/tema';

/**
 * Componentes-base do design system. Nenhum deles usa `dark:` — o modo
 * escuro vem da inversão de variáveis em tema-escuro.css, então tela nova
 * nasce com os dois temas de graça.
 */

export function juntar(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Botão ───────────────────────────────────────────────────────

type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo';
type TamanhoBotao = 'md' | 'sm' | 'icone';

const ESTILO_BOTAO: Record<VarianteBotao, string> = {
  primario: 'bg-brand-medium text-white hover:bg-brand shadow-sm',
  secundario: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 shadow-sm',
  fantasma: 'text-brand-medium hover:bg-gray-100',
  perigo: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
};

const TAMANHO_BOTAO: Record<TamanhoBotao, string> = {
  md: 'px-4 py-2.5 text-sm',
  sm: 'px-3 py-1.5 text-xs',
  // Só o ícone, sem texto ao lado — precisa de aria-label no lugar de children legível.
  icone: 'p-2',
};

interface PropsBotao extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  carregando?: boolean;
}

export function Botao({
  variante = 'primario',
  tamanho = 'md',
  carregando = false,
  disabled,
  className,
  children,
  ...resto
}: PropsBotao) {
  return (
    <button
      {...resto}
      disabled={disabled || carregando}
      className={juntar(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        ESTILO_BOTAO[variante],
        TAMANHO_BOTAO[tamanho],
        className,
      )}
    >
      {carregando && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

// ─── Superfícies ─────────────────────────────────────────────────

/**
 * Cartão. É coluna flex por padrão: todo espaçamento interno do app sai de
 * `gap`, nunca de margem avulsa — e sem `display:flex` aqui o `gap` que as
 * telas passam simplesmente não vale, e os textos encostam uns nos outros.
 */
export function Cartao({
  className,
  children,
  ...resto
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...resto}
      className={juntar(
        'flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── Selo de status ──────────────────────────────────────────────

export type TomStatus = 'ok' | 'atencao' | 'erro' | 'concluido' | 'neutro' | 'marca';

const ESTILO_SELO: Record<TomStatus, string> = {
  ok: 'bg-green-100 text-green-800',
  atencao: 'bg-amber-100 text-amber-800',
  erro: 'bg-red-100 text-red-800',
  concluido: 'bg-blue-100 text-blue-800',
  neutro: 'bg-gray-100 text-gray-600',
  marca: 'bg-orange-100 text-orange-800',
};

export function Selo({
  tom = 'neutro',
  children,
  className,
}: {
  tom?: TomStatus;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={juntar(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        ESTILO_SELO[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ─── Formulário ──────────────────────────────────────────────────

export function Campo({
  rotulo,
  dica,
  erro,
  obrigatorio,
  children,
}: {
  rotulo: string;
  dica?: string;
  erro?: string;
  obrigatorio?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700">
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
      {erro ? (
        <span className="text-xs text-red-600">{erro}</span>
      ) : dica ? (
        <span className="text-xs text-gray-500">{dica}</span>
      ) : null}
    </label>
  );
}

const CLASSES_ENTRADA =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:border-brand-medium focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500';

export function Entrada({ className, ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...resto} className={juntar(CLASSES_ENTRADA, className)} />;
}

export function Selecao({
  className,
  children,
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...resto} className={juntar(CLASSES_ENTRADA, 'pr-8', className)}>
      {children}
    </select>
  );
}

// ─── Barra de progresso ──────────────────────────────────────────

export function BarraProgresso({
  valor,
  total,
  rotulo,
}: {
  valor: number;
  total: number;
  rotulo?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={valor}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={rotulo ?? 'Progresso'}
      >
        <div
          className="h-full rounded-full bg-brand-medium transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {rotulo && <span className="text-xs text-gray-500">{rotulo}</span>}
    </div>
  );
}

// ─── Estado vazio ────────────────────────────────────────────────
// Cartão com ícone em tile, título, uma frase e a ação que sai dali —
// não um parágrafo cinza solto no meio da tela.

export function EstadoVazio({
  icone,
  titulo,
  descricao,
  acao,
}: {
  icone: ReactNode;
  titulo: string;
  descricao: string;
  acao?: ReactNode;
}) {
  return (
    <Cartao className="relative overflow-hidden">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 -right-8 h-40 w-40 text-gray-100"
        viewBox="0 0 100 100"
        fill="none"
      >
        <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="22" stroke="currentColor" strokeWidth="1.5" />
        <rect x="28" y="28" width="44" height="44" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div className="relative flex flex-col items-start gap-3 p-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-brand-medium">
          {icone}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-brand">{titulo}</h3>
          <p className="max-w-prose text-sm text-gray-500">{descricao}</p>
        </div>
        {acao}
      </div>
    </Cartao>
  );
}

// ─── Esqueleto ───────────────────────────────────────────────────
// Só para o carregamento INICIAL. Atualização de dado já visível não
// troca a tela por esqueleto — e lista vazia nunca pisca antes dos dados.

export function Esqueleto({ className }: { className?: string }) {
  return <div className={juntar('animate-pulse rounded-lg bg-gray-200', className)} />;
}

export function EsqueletoLinhas({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: linhas }, (_, i) => (
        <Esqueleto key={i} className={i === linhas - 1 ? 'h-4 w-2/3' : 'h-4 w-full'} />
      ))}
    </div>
  );
}

// ─── Seletor de tema ─────────────────────────────────────────────

export function SeletorTema() {
  const { tema, definirTema } = useTema();
  const opcoes = [
    { id: 'claro', rotulo: 'Claro' },
    { id: 'escuro', rotulo: 'Escuro' },
    { id: 'sistema', rotulo: 'Sistema' },
  ] as const;

  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => definirTema(o.id)}
          aria-pressed={tema === o.id}
          className={juntar(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            tema === o.id ? 'bg-brand-medium text-white' : 'text-gray-600 hover:bg-gray-100',
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
