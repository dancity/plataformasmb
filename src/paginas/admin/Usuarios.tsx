import { useCallback, useEffect, useMemo, useState } from 'react';
import { DialogoConfirmacao, Modal } from '@/componentes/Modal';
import {
  Botao,
  Campo,
  Cartao,
  Entrada,
  EsqueletoLinhas,
  EstadoVazio,
  Selecao,
  Selo,
} from '@/componentes/ui';
import type { TomStatus } from '@/componentes/ui';
import { listarRegionais, listarUnidades } from '@/lib/dados';
import { definirPapel, desativarUsuario, listarUsuarios } from '@/lib/usuarios';
import type { Papel, Regional, Unidade, Usuario } from '@dominio/tipos';

/**
 * Cadastro de usuários. Papel e vínculo são a mesma decisão: a pessoa atua
 * numa unidade (gestor daquela unidade), numa regional (aprova o que a
 * unidade envia) ou no nacional (administra o catálogo inteiro, ou só
 * acompanha em modo leitura). Não existe conta solta sem um desses três.
 */

type Nivel = 'unidade' | 'regional' | 'nacional';

function nivelDoPapel(papel: Papel): Nivel {
  if (papel === 'gestor_unidade') return 'unidade';
  if (papel === 'gestor_regional') return 'regional';
  return 'nacional';
}

const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  gestor_regional: 'Gestor regional',
  gestor_unidade: 'Gestor de unidade',
  leitura: 'Leitura',
};

const TOM_PAPEL: Record<Papel, TomStatus> = {
  admin: 'marca',
  gestor_regional: 'concluido',
  gestor_unidade: 'ok',
  leitura: 'neutro',
};

interface Rascunho {
  nome: string;
  email: string;
  nivel: Nivel;
  papelNacional: Extract<Papel, 'admin' | 'leitura'>;
  regionalId: string;
  unidadeId: string;
}

const VAZIO: Rascunho = {
  nome: '',
  email: '',
  nivel: 'unidade',
  papelNacional: 'admin',
  regionalId: '',
  unidadeId: '',
};

export function Usuarios() {
  const [carregando, setCarregando] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [regionais, setRegionais] = useState<Regional[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [desativando, setDesativando] = useState<Usuario | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [us, rs, uns] = await Promise.all([
        listarUsuarios(),
        listarRegionais(),
        listarUnidades(),
      ]);
      setUsuarios(us);
      setRegionais(rs);
      setUnidades(uns);
    } catch {
      setErro('Não foi possível carregar os usuários.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const nomeRegional = useCallback(
    (id?: string) => regionais.find((r) => r.id === id)?.nome ?? id ?? '—',
    [regionais],
  );
  const nomeUnidade = useCallback(
    (id?: string) => unidades.find((u) => u.id === id)?.nome ?? id ?? '—',
    [unidades],
  );

  const unidadesDaRegional = useMemo(
    () => unidades.filter((u) => u.regionalId === rascunho.regionalId),
    [unidades, rascunho.regionalId],
  );

  function vinculo(u: Usuario): string {
    if (u.papel === 'gestor_unidade') return nomeUnidade(u.unidadeId);
    if (u.papel === 'gestor_regional') return nomeRegional(u.regionalId);
    return 'Nacional';
  }

  function abrirNovo() {
    setRascunho(VAZIO);
    setEditando(null);
    setErro(null);
    setAberto(true);
  }

  function abrirEdicao(u: Usuario) {
    setRascunho({
      nome: u.nome ?? '',
      email: u.email,
      nivel: nivelDoPapel(u.papel),
      papelNacional: u.papel === 'leitura' ? 'leitura' : 'admin',
      regionalId: u.regionalId ?? '',
      unidadeId: u.unidadeId ?? '',
    });
    setEditando(u);
    setErro(null);
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    setEditando(null);
    setErro(null);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const email = rascunho.email.trim();
      if (!email) throw new Error('O e-mail é obrigatório.');

      if (rascunho.nivel === 'unidade') {
        if (!rascunho.unidadeId) throw new Error('Escolha a unidade.');
        const unidade = unidades.find((u) => u.id === rascunho.unidadeId);
        if (!unidade) throw new Error('Unidade não encontrada.');
        await definirPapel({
          email,
          nome: rascunho.nome.trim() || undefined,
          papel: 'gestor_unidade',
          unidadeId: unidade.id,
          regionalId: unidade.regionalId,
        });
      } else if (rascunho.nivel === 'regional') {
        if (!rascunho.regionalId) throw new Error('Escolha a regional.');
        await definirPapel({
          email,
          nome: rascunho.nome.trim() || undefined,
          papel: 'gestor_regional',
          regionalId: rascunho.regionalId,
        });
      } else {
        await definirPapel({
          email,
          nome: rascunho.nome.trim() || undefined,
          papel: rascunho.papelNacional,
        });
      }

      fechar();
      await carregar();
    } catch (e) {
      setErro((e as Error).message ?? 'Não deu certo. Confira os campos.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <EsqueletoLinhas linhas={4} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-brand">Usuários</h1>
          <p className="text-sm text-gray-500">
            Cada pessoa atua numa unidade, numa regional, ou no nacional — é o vínculo que decide
            o que ela vê e o que ela pode fazer, não a interface escondendo botão.
          </p>
        </div>
        <Botao onClick={abrirNovo}>Novo usuário</Botao>
      </div>

      {erro && !aberto && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {usuarios.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">👤</span>}
          titulo="Nenhum usuário cadastrado"
          descricao="Cadastre pela unidade, pela regional ou como administrador nacional. A pessoa entra depois, por SSO ou link, e já cai no vínculo certo."
          acao={<Botao onClick={abrirNovo}>Cadastrar o primeiro</Botao>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {usuarios.map((u) => (
            <Cartao key={u.id} className="gap-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-700">{u.nome || u.email}</span>
                    <Selo tom={TOM_PAPEL[u.papel]}>{ROTULO_PAPEL[u.papel]}</Selo>
                    {!u.ativo && <Selo tom="erro">inativo</Selo>}
                  </div>
                  <span className="text-xs text-gray-500">
                    {u.email} · {vinculo(u)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Botao variante="secundario" tamanho="sm" onClick={() => abrirEdicao(u)}>
                    Editar vínculo
                  </Botao>
                  {u.ativo && (
                    <Botao variante="fantasma" tamanho="sm" onClick={() => setDesativando(u)}>
                      Desativar
                    </Botao>
                  )}
                </div>
              </div>
            </Cartao>
          ))}
        </div>
      )}

      <Modal
        aberto={aberto}
        aoFechar={fechar}
        titulo={editando ? 'Editar vínculo' : 'Novo usuário'}
        descricao="Definir papel de novo não duplica: o e-mail é a chave, e o vínculo anterior é substituído."
        rodape={
          <>
            <Botao variante="secundario" onClick={fechar} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void salvar()} carregando={salvando}>
              {editando ? 'Salvar vínculo' : 'Cadastrar'}
            </Botao>
          </>
        }
      >
        <Campo rotulo="Nome" dica="Opcional — se a pessoa já tiver conta, o nome dela é usado.">
          <Entrada
            value={rascunho.nome}
            onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            placeholder="Maria Silva"
          />
        </Campo>

        <Campo rotulo="E-mail" obrigatorio dica="Se a conta ainda não existir, ela é criada agora.">
          <Entrada
            type="email"
            value={rascunho.email}
            onChange={(e) => setRascunho({ ...rascunho, email: e.target.value })}
            placeholder="nome@marista.org.br"
            disabled={!!editando}
          />
        </Campo>

        <Campo rotulo="Onde a pessoa atua" obrigatorio>
          <Selecao
            value={rascunho.nivel}
            onChange={(e) =>
              setRascunho({ ...rascunho, nivel: e.target.value as Nivel, unidadeId: '' })
            }
          >
            <option value="unidade">Unidade — monta o pedido de uma unidade</option>
            <option value="regional">Regional — aprova os pedidos da regional</option>
            <option value="nacional">Nacional — administra ou só acompanha a rede</option>
          </Selecao>
        </Campo>

        {rascunho.nivel === 'unidade' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Regional" obrigatorio>
              <Selecao
                value={rascunho.regionalId}
                onChange={(e) =>
                  setRascunho({ ...rascunho, regionalId: e.target.value, unidadeId: '' })
                }
              >
                <option value="">Escolha…</option>
                {regionais.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Unidade" obrigatorio>
              <Selecao
                value={rascunho.unidadeId}
                onChange={(e) => setRascunho({ ...rascunho, unidadeId: e.target.value })}
                disabled={!rascunho.regionalId}
              >
                <option value="">
                  {rascunho.regionalId ? 'Escolha…' : 'Escolha a regional primeiro'}
                </option>
                {unidadesDaRegional.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </div>
        )}

        {rascunho.nivel === 'regional' && (
          <Campo rotulo="Regional" obrigatorio>
            <Selecao
              value={rascunho.regionalId}
              onChange={(e) => setRascunho({ ...rascunho, regionalId: e.target.value })}
            >
              <option value="">Escolha…</option>
              {regionais.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        )}

        {rascunho.nivel === 'nacional' && (
          <Campo rotulo="Papel" dica="Administrador edita o catálogo inteiro; leitura só acompanha.">
            <Selecao
              value={rascunho.papelNacional}
              onChange={(e) =>
                setRascunho({
                  ...rascunho,
                  papelNacional: e.target.value as 'admin' | 'leitura',
                })
              }
            >
              <option value="admin">Administrador</option>
              <option value="leitura">Leitura</option>
            </Selecao>
          </Campo>
        )}

        {erro && (
          <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {erro}
          </p>
        )}
      </Modal>

      <DialogoConfirmacao
        aberto={!!desativando}
        nivel="medio"
        titulo="Desativar usuário"
        descricao="A pessoa perde acesso no próximo login — o cadastro continua na lista, com o histórico de quem fez o quê."
        detalhe={
          desativando && (
            <span className="font-medium">
              {desativando.nome || desativando.email} · {ROTULO_PAPEL[desativando.papel]}
            </span>
          )
        }
        textoConfirmar="Desativar"
        carregando={ocupado}
        aoCancelar={() => setDesativando(null)}
        aoConfirmar={() => {
          const alvo = desativando;
          if (!alvo) return;
          setDesativando(null);
          setOcupado(true);
          void desativarUsuario(alvo.id)
            .then(carregar)
            .catch(() => setErro('Não foi possível desativar. Tente de novo.'))
            .finally(() => setOcupado(false));
        }}
      />
    </div>
  );
}
