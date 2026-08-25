import { Cartao, Selo } from '@/componentes/ui';

/** Andaime temporário: some conforme cada área é construída. */
export function EmConstrucao({ titulo, proximo }: { titulo: string; proximo: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-brand">{titulo}</h1>
        <Selo tom="concluido">em construção</Selo>
      </div>
      <Cartao className="p-6">
        <p className="text-sm text-gray-500">
          A base do app está de pé: sessão, papéis, tema e a estrutura de dados. Próximo passo desta
          área: {proximo}
        </p>
      </Cartao>
    </div>
  );
}
