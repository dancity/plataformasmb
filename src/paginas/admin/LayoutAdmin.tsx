import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { Esqueleto, juntar } from '@/componentes/ui';
import { listarCiclos } from '@/lib/dados';
import type { Ciclo } from '@dominio/tipos';

/**
 * Casca da administração. Carrega o ciclo corrente uma vez e entrega às
 * telas filhas — tudo no catálogo é carimbado com ele, então nenhuma tela
 * deveria ter que descobrir sozinha em que ciclo está.
 */
export interface ContextoAdmin {
  ciclo: Ciclo | null;
  recarregarCiclo: () => Promise<void>;
}

export function useAdmin(): ContextoAdmin {
  return useOutletContext<ContextoAdmin>();
}

const ABAS = [
  { para: '/admin', rotulo: 'Ciclo', fim: true },
  { para: '/admin/solucoes', rotulo: 'Soluções', fim: false },
  { para: '/admin/fornecedores', rotulo: 'Fornecedores', fim: false },
  { para: '/admin/unidades', rotulo: 'Unidades', fim: false },
  { para: '/admin/usuarios', rotulo: 'Usuários', fim: false },
  { para: '/admin/simular', rotulo: 'Simular gestor', fim: false },
];

export function LayoutAdmin() {
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregarCiclo = useCallback(async () => {
    const ciclos = await listarCiclos();
    setCiclo(ciclos[0] ?? null);
  }, []);

  useEffect(() => {
    recarregarCiclo()
      .catch(() => setCiclo(null))
      .finally(() => setCarregando(false));
  }, [recarregarCiclo]);

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-1 border-b border-gray-200" aria-label="Administração">
        {ABAS.map((aba) => (
          <NavLink
            key={aba.para}
            to={aba.para}
            end={aba.fim}
            className={({ isActive }) =>
              juntar(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-brand-medium text-brand'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )
            }
          >
            {aba.rotulo}
          </NavLink>
        ))}
      </nav>

      {carregando ? (
        <div className="flex flex-col gap-3">
          <Esqueleto className="h-7 w-56" />
          <Esqueleto className="h-24 w-full" />
        </div>
      ) : (
        <Outlet context={{ ciclo, recarregarCiclo } satisfies ContextoAdmin} />
      )}
    </div>
  );
}
