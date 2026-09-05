import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/componentes/Layout';
import { useAuth } from '@/lib/auth';
import type { Papel } from '@dominio/tipos';
import { Entrar } from '@/paginas/Entrar';
import { SemVinculo } from '@/paginas/SemVinculo';
import { Carregando } from '@/paginas/Carregando';
import { EmConstrucao } from '@/paginas/EmConstrucao';
import { FluxoPedido } from '@/paginas/gestor/FluxoPedido';
import { LayoutAdmin } from '@/paginas/admin/LayoutAdmin';
import { PainelAdmin } from '@/paginas/admin/PainelAdmin';
import { Solucoes } from '@/paginas/admin/Solucoes';
import { SolucaoForm } from '@/paginas/admin/SolucaoForm';
import { Fornecedores } from '@/paginas/admin/Fornecedores';
import { Unidades } from '@/paginas/admin/Unidades';
import { Usuarios } from '@/paginas/admin/Usuarios';

/** Para onde cada papel vai ao abrir o app. */
const DESTINO_PADRAO: Record<Papel, string> = {
  admin: '/admin',
  gestor_regional: '/regional',
  gestor_unidade: '/pedido',
  leitura: '/regional',
};

function Protegida({ papeis, children }: { papeis: Papel[]; children: React.ReactNode }) {
  const { estado } = useAuth();

  if (estado.situacao === 'carregando') return <Carregando />;
  if (estado.situacao === 'anonimo') return <Navigate to="/entrar" replace />;
  if (estado.situacao === 'sem_vinculo') return <SemVinculo email={estado.email} />;
  if (!papeis.includes(estado.sessao.papel)) {
    return <Navigate to={DESTINO_PADRAO[estado.sessao.papel]} replace />;
  }
  return <Layout>{children}</Layout>;
}

export function App() {
  const { estado } = useAuth();

  return (
    <Routes>
      <Route
        path="/entrar"
        element={
          estado.situacao === 'ativa' ? (
            <Navigate to={DESTINO_PADRAO[estado.sessao.papel]} replace />
          ) : (
            <Entrar />
          )
        }
      />

      <Route
        path="/pedido/*"
        element={
          <Protegida papeis={['gestor_unidade']}>
            <FluxoPedido />
          </Protegida>
        }
      />

      <Route
        path="/regional/*"
        element={
          <Protegida papeis={['gestor_regional', 'leitura']}>
            <EmConstrucao
              titulo="Fila da regional"
              proximo="Lista de pedidos com aprovar, devolver e reprovar."
            />
          </Protegida>
        }
      />

      <Route
        path="/admin"
        element={
          <Protegida papeis={['admin']}>
            <LayoutAdmin />
          </Protegida>
        }
      >
        <Route index element={<PainelAdmin />} />
        <Route path="solucoes" element={<Solucoes />} />
        <Route path="solucoes/novo" element={<SolucaoForm />} />
        <Route path="solucoes/:produtoId/editar" element={<SolucaoForm />} />
        <Route path="fornecedores" element={<Fornecedores />} />
        <Route path="unidades" element={<Unidades />} />
        <Route path="usuarios" element={<Usuarios />} />
      </Route>

      <Route
        path="*"
        element={
          estado.situacao === 'ativa' ? (
            <Navigate to={DESTINO_PADRAO[estado.sessao.papel]} replace />
          ) : estado.situacao === 'carregando' ? (
            <Carregando />
          ) : (
            <Navigate to="/entrar" replace />
          )
        }
      />
    </Routes>
  );
}
