import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/componentes/Modal';
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
import { atualizarUnidade, criarUnidade, listarRegionais, listarUnidades } from '@/lib/dados';
import type { Regional, TipoUnidade, Unidade } from '@dominio/tipos';

const SELO_TIPO = {
  paga: { tom: 'neutro', rotulo: 'paga' },
  social: { tom: 'ok', rotulo: 'social' },
} as const;

export function Unidades() {
  const [carregando, setCarregando] = useState(true);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [regionais, setRegionais] = useState<Regional[]>([]);
  const [filtro, setFiltro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Unidade | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [regionalId, setRegionalId] = useState('');
  const [tipo, setTipo] = useState<TipoUnidade>('paga');

  const carregar = useCallback(async () => {
    try {
      const [us, rs] = await Promise.all([listarUnidades(), listarRegionais()]);
      setUnidades(us);
      setRegionais(rs);
    } catch {
      setErro('Não foi possível carregar as unidades.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const nomeRegional = useCallback(
    (id: string) => regionais.find((r) => r.id === id)?.nome ?? id,
    [regionais],
  );

  // Com 97 unidades, buscar é mais rápido que rolar.
  const visiveis = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return unidades;
    return unidades.filter(
      (u) =>
        u.nome.toLowerCase().includes(termo) ||
        u.codigo.toLowerCase().includes(termo) ||
        nomeRegional(u.regionalId).toLowerCase().includes(termo),
    );
  }, [unidades, filtro, nomeRegional]);

  const porRegional = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const u of unidades) mapa.set(u.regionalId, (mapa.get(u.regionalId) ?? 0) + 1);
    return mapa;
  }, [unidades]);

  function abrirNova() {
    setEditando(null);
    setNome('');
    setCodigo('');
    setRegionalId('');
    setTipo('paga');
    setErro(null);
    setAberto(true);
  }

  function abrirEdicao(u: Unidade) {
    setEditando(u);
    setNome(u.nome);
    setCodigo(u.codigo);
    setRegionalId(u.regionalId);
    // Cadastrada antes deste campo existir conta como paga, a mais comum.
    setTipo(u.tipo ?? 'paga');
    setErro(null);
    setAberto(true);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      if (!nome.trim()) throw new Error('A unidade precisa de um nome.');
      if (!regionalId) throw new Error('Escolha a regional.');

      if (editando) {
        await atualizarUnidade(editando.id, { nome: nome.trim(), regionalId, tipo });
      } else {
        if (!codigo.trim()) throw new Error('O código identifica a unidade — não pode ficar vazio.');
        await criarUnidade({ nome, codigo, regionalId, tipo });
      }
      setAberto(false);
      await carregar();
    } catch (e) {
      setErro((e as Error).message ?? 'Não deu certo.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <EsqueletoLinhas linhas={4} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-brand">Unidades</h1>
          <p className="text-sm text-gray-500">
            {unidades.length} cadastrada{unidades.length === 1 ? '' : 's'}. Cada unidade pertence a
            uma regional, e é a regional que decide o que ela pode contratar. Unidade social paga o
            preço social das soluções que tiverem um cadastrado.
          </p>
        </div>
        <Botao onClick={abrirNova} disabled={regionais.length === 0}>
          Nova unidade
        </Botao>
      </div>

      {erro && !aberto && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {regionais.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">🗺️</span>}
          titulo="Cadastre as regionais primeiro"
          descricao="As seis regionais precisam existir antes das unidades. A aba Ciclo tem o botão que cadastra todas de uma vez."
        />
      ) : unidades.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">🏫</span>}
          titulo="Nenhuma unidade cadastrada"
          descricao="São 97 na rede. Comece por uma para testar o fluxo inteiro de ponta a ponta; a carga em massa por planilha entra depois, quando a lista oficial estiver fechada."
          acao={<Botao onClick={abrirNova}>Cadastrar uma unidade</Botao>}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {regionais.map((r) => (
              <span
                key={r.id}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
              >
                {r.nome}: {porRegional.get(r.id) ?? 0}
              </span>
            ))}
          </div>

          <Entrada
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar por nome, código ou regional…"
            aria-label="Buscar unidade"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiveis.map((u) => (
              <Cartao key={u.id} className="gap-1 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium text-gray-700">{u.nome}</span>
                  <Selo tom={SELO_TIPO[u.tipo ?? 'paga'].tom}>{SELO_TIPO[u.tipo ?? 'paga'].rotulo}</Selo>
                </div>
                <span className="text-xs text-gray-500">{nomeRegional(u.regionalId)}</span>
                <span className="font-mono text-xs text-gray-400">{u.codigo}</span>
                <button
                  type="button"
                  onClick={() => abrirEdicao(u)}
                  className="mt-1 w-fit text-xs text-brand-medium hover:underline"
                >
                  Editar
                </button>
              </Cartao>
            ))}
          </div>

          {visiveis.length === 0 && (
            <p className="text-sm text-gray-500">Nenhuma unidade corresponde a “{filtro}”.</p>
          )}
        </>
      )}

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={editando ? 'Editar unidade' : 'Nova unidade'}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void salvar()} carregando={salvando}>
              {editando ? 'Salvar alterações' : 'Cadastrar'}
            </Botao>
          </>
        }
      >
        <Campo rotulo="Nome" obrigatorio>
          <Entrada
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Colégio Marista Boa Viagem"
          />
        </Campo>
        <Campo
          rotulo="Código"
          obrigatorio={!editando}
          dica={
            editando
              ? 'Vira o identificador da unidade no sistema — não muda depois de cadastrado.'
              : 'Vira o identificador da unidade no sistema. Curto e estável.'
          }
        >
          <Entrada
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="boa-viagem"
            disabled={!!editando}
          />
        </Campo>
        <Campo rotulo="Regional" obrigatorio>
          <Selecao value={regionalId} onChange={(e) => setRegionalId(e.target.value)}>
            <option value="">Escolha…</option>
            {regionais.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo
          rotulo="Tipo"
          dica="Social paga o preço social das soluções que tiverem um cadastrado e habilitado; do contrário, o preço normal vale igual."
        >
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoUnidade)}>
            <option value="paga">Paga</option>
            <option value="social">Social</option>
          </Selecao>
        </Campo>
        {erro && (
          <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {erro}
          </p>
        )}
      </Modal>
    </div>
  );
}
