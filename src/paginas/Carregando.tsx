import { Esqueleto } from '@/componentes/ui';

/**
 * Carregamento inicial. Esqueleto, nunca estado vazio: "nenhum pedido
 * encontrado" piscando antes dos dados chegarem é uma mensagem errada.
 */
export function Carregando() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10">
      <Esqueleto className="h-7 w-64" />
      <Esqueleto className="h-4 w-96" />
      <div className="mt-4 flex flex-col gap-3">
        <Esqueleto className="h-24 w-full" />
        <Esqueleto className="h-24 w-full" />
      </div>
    </div>
  );
}
