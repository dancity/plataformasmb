import { useCallback, useEffect, useMemo, useState } from 'react';
import { DialogoConfirmacao, Modal } from '@/componentes/Modal';
import {
  AreaTexto,
  Botao,
  Campo,
  Cartao,
  Entrada,
  EsqueletoLinhas,
  EstadoVazio,
  Selecao,
  Selo,
} from '@/componentes/ui';
import {
  MANTENEDORAS_PADRAO,
  atualizarUnidade,
  criarUnidade,
  criarUnidadesEmLote,
  excluirUnidade,
  listarRegionais,
  listarUnidades,
  vinculosDaUnidade,
} from '@/lib/dados';
import type { VinculosUnidade } from '@/lib/dados';
import { analisarColagem, type ResultadoImportacao } from '@/lib/importarUnidades';
import type { Mantenedora, Regional, TipoUnidade, Unidade } from '@dominio/tipos';

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
  const [mantenedora, setMantenedora] = useState<Mantenedora | ''>('');

  // A exclusão só abre depois de saber o que depende da unidade: um diálogo
  // que aparece vazio e depois se preenche faz a pessoa ler duas vezes.
  const [conferindo, setConferindo] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<{
    unidade: Unidade;
    vinculos: VinculosUnidade;
  } | null>(null);
  const [apagando, setApagando] = useState(false);

  const [importarAberto, setImportarAberto] = useState(false);
  const [colado, setColado] = useState('');
  const [analise, setAnalise] = useState<ResultadoImportacao | null>(null);
  const [importando, setImportando] = useState(false);
  const [resumoImportacao, setResumoImportacao] = useState<{
    criadas: number;
    existentes: number;
  } | null>(null);

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
    setMantenedora('');
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
    setMantenedora(u.mantenedora ?? '');
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
        await atualizarUnidade(editando.id, {
          nome: nome.trim(),
          regionalId,
          tipo,
          ...(mantenedora ? { mantenedora } : {}),
        });
      } else {
        if (!codigo.trim()) throw new Error('O código identifica a unidade — não pode ficar vazio.');
        await criarUnidade({ nome, codigo, regionalId, tipo, mantenedora: mantenedora || undefined });
      }
      setAberto(false);
      await carregar();
    } catch (e) {
      setErro((e as Error).message ?? 'Não deu certo.');
    } finally {
      setSalvando(false);
    }
  }

  async function pedirExclusao(u: Unidade) {
    setErro(null);
    setConferindo(u.id);
    try {
      setExcluindo({ unidade: u, vinculos: await vinculosDaUnidade(u.id) });
    } catch {
      setErro('Não foi possível conferir o que depende desta unidade. Tente de novo.');
    } finally {
      setConferindo(null);
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    const alvo = excluindo.unidade;
    setApagando(true);
    setErro(null);
    try {
      await excluirUnidade(alvo.id);
      setExcluindo(null);
      await carregar();
    } catch (e) {
      setExcluindo(null);
      setErro((e as Error).message || 'Não foi possível excluir a unidade.');
    } finally {
      setApagando(false);
    }
  }

  // Pedido trava a exclusão; gestor vinculado só avisa.
  const travada = !!excluindo && excluindo.vinculos.pedidos > 0;

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
        <div className="flex gap-2">
          <Botao
            variante="secundario"
            onClick={() => {
              setColado('');
              setAnalise(null);
              setResumoImportacao(null);
              setErro(null);
              setImportarAberto(true);
            }}
            disabled={regionais.length === 0}
          >
            Importar em lote
          </Botao>
          <Botao onClick={abrirNova} disabled={regionais.length === 0}>
            Nova unidade
          </Botao>
        </div>
      </div>

      {erro && !aberto && !importarAberto && (
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
          descricao="São 97 na rede. Use o botão “Importar em lote” pra colar a planilha oficial de uma vez, ou cadastre uma por uma pelo botão “Nova unidade”."
          acao={
            <div className="flex gap-2">
              <Botao
                variante="secundario"
                onClick={() => {
                  setColado('');
                  setAnalise(null);
                  setResumoImportacao(null);
                  setErro(null);
                  setImportarAberto(true);
                }}
              >
                Importar em lote
              </Botao>
              <Botao onClick={abrirNova}>Cadastrar uma unidade</Botao>
            </div>
          }
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
                <span className="text-xs text-gray-500">
                  {nomeRegional(u.regionalId)}
                  {u.mantenedora ? ` · ${u.mantenedora}` : ''}
                </span>
                <span className="font-mono text-xs text-gray-400">{u.codigo}</span>
                <div className="mt-1 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(u)}
                    className="text-xs text-brand-medium hover:underline"
                  >
                    Editar
                  </button>
                  {/* Destrutiva depois da ação de rotina, e sem cor de alerta
                      em repouso: um cartão de unidade não precisa ficar
                      vermelho o tempo todo por causa do que ele permite. */}
                  <button
                    type="button"
                    onClick={() => void pedirExclusao(u)}
                    disabled={conferindo !== null}
                    className="text-xs text-gray-500 hover:text-red-700 hover:underline disabled:opacity-50"
                  >
                    {conferindo === u.id ? 'Conferindo…' : 'Excluir'}
                  </button>
                </div>
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
        <Campo rotulo="Mantenedora">
          <Selecao
            value={mantenedora}
            onChange={(e) => setMantenedora(e.target.value as Mantenedora | '')}
          >
            <option value="">Não informada</option>
            {MANTENEDORAS_PADRAO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Selecao>
        </Campo>
        {erro && (
          <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {erro}
          </p>
        )}
      </Modal>

      <Modal
        aberto={importarAberto}
        aoFechar={() => setImportarAberto(false)}
        titulo="Importar unidades em lote"
        rodape={
          <>
            <Botao
              variante="secundario"
              onClick={() => setImportarAberto(false)}
              disabled={importando}
            >
              Fechar
            </Botao>
            {analise && (
              <Botao
                onClick={() => {
                  const prontas = analise.prontas;
                  setImportando(true);
                  void criarUnidadesEmLote(prontas)
                    .then((resumo) => {
                      setResumoImportacao(resumo);
                      setColado('');
                      setAnalise(null);
                      return carregar();
                    })
                    .catch(() => setErro('Não foi possível importar. Tente de novo.'))
                    .finally(() => setImportando(false));
                }}
                disabled={analise.erros.length > 0 || analise.prontas.length === 0}
                carregando={importando}
              >
                Confirmar importação
              </Botao>
            )}
          </>
        }
      >
        <p className="text-sm text-gray-500">
          Cole aqui as colunas <strong>Unidade</strong>, <strong>Mantenedora</strong>,{' '}
          <strong>Regional</strong> e <strong>Pago | Social</strong>, direto do Excel — cabeçalho
          e linhas repetidas (uma por ano escolar, por exemplo) não atrapalham: a mesma unidade
          colapsa numa só. Unidade que já existe no cadastro é pulada, nunca sobrescrita.
        </p>
        <Campo rotulo="Dados colados">
          <AreaTexto
            value={colado}
            onChange={(e) => {
              setColado(e.target.value);
              setAnalise(null);
              setResumoImportacao(null);
            }}
            rows={10}
            placeholder={'Colégio Marista Boa Viagem\tABEC\tRecife\tPago'}
          />
        </Campo>
        {!analise && (
          <Botao
            variante="secundario"
            onClick={() => setAnalise(analisarColagem(colado))}
            disabled={!colado.trim()}
          >
            Analisar
          </Botao>
        )}
        {analise && (
          <div className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3 text-sm">
            <span className="font-medium text-gray-700">
              {analise.prontas.length} unidade{analise.prontas.length === 1 ? '' : 's'} pronta
              {analise.prontas.length === 1 ? '' : 's'} pra importar
              {analise.erros.length > 0 && ` · ${analise.erros.length} com problema`}
            </span>
            {analise.erros.length > 0 && (
              <ul className="flex flex-col gap-0.5 text-xs text-red-700">
                {analise.erros.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setAnalise(null)}
              className="w-fit text-xs text-brand-medium hover:underline"
            >
              Analisar de novo
            </button>
          </div>
        )}
        {resumoImportacao && (
          <p role="status" className="rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800">
            {resumoImportacao.criadas} unidade{resumoImportacao.criadas === 1 ? '' : 's'}{' '}
            criada{resumoImportacao.criadas === 1 ? '' : 's'}
            {resumoImportacao.existentes > 0 &&
              ` · ${resumoImportacao.existentes} já existia${resumoImportacao.existentes === 1 ? '' : 'm'} e foi(ram) pulada(s)`}
            .
          </p>
        )}
        {erro && importarAberto && (
          <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {erro}
          </p>
        )}
      </Modal>

      {/* Travada: não há o que confirmar, só o que explicar. Um diálogo de
          confirmação com o botão desligado faria a pessoa procurar o que
          digitar pra liberar — e não há nada que libere. */}
      <Modal
        aberto={travada}
        aoFechar={() => setExcluindo(null)}
        titulo="Esta unidade não pode ser excluída"
        descricao="Ela já tem pedido registrado neste ou em outro ciclo."
        rodape={<Botao onClick={() => setExcluindo(null)}>Entendi</Botao>}
      >
        {excluindo && (
          <div className="flex flex-col gap-3 text-sm text-gray-600">
            <p>
              <strong>{excluindo.unidade.nome}</strong> tem {excluindo.vinculos.pedidos} pedido
              {excluindo.vinculos.pedidos === 1 ? '' : 's'}. Pedido guarda o preço congelado e a
              trilha de quem aprovou o quê — apagar a unidade deixaria esse histórico pendurado
              num cadastro que não existe mais, sem nome pra abrir na fila da regional.
            </p>
            <p>
              Se a unidade saiu da rede, o caminho é mudar o vínculo dos gestores dela e deixar o
              cadastro parado: o pedido continua auditável, e ninguém novo entra por ele.
            </p>
          </div>
        )}
      </Modal>

      <DialogoConfirmacao
        aberto={!!excluindo && !travada}
        nivel="perigo"
        titulo="Excluir unidade"
        descricao="O cadastro sai da lista e a previsão de alunos dela vai junto."
        detalhe={
          excluindo && (
            <div className="flex flex-col gap-1">
              <span>
                <strong>{excluindo.unidade.nome}</strong> ·{' '}
                {nomeRegional(excluindo.unidade.regionalId)}
              </span>
              <span className="font-mono text-xs">{excluindo.unidade.codigo}</span>
              {excluindo.vinculos.previsoes > 0 && (
                <span className="text-xs">
                  {excluindo.vinculos.previsoes} previsão(ões) de alunos serão apagadas junto.
                </span>
              )}
              {/* O gestor não some com a unidade: o vínculo dele fica apontando
                  pra um cadastro que não existe, e ele trava na própria tela
                  sem entender por quê. Quem apaga precisa saber disso antes. */}
              {excluindo.vinculos.gestores > 0 && (
                <span className="text-xs text-amber-700">
                  {excluindo.vinculos.gestores} gestor(es) têm vínculo com esta unidade e vão
                  ficar sem acesso. Redefina o vínculo deles na aba Usuários depois.
                </span>
              )}
            </div>
          )
        }
        textoConfirmar="Excluir unidade"
        nomeParaDigitar={excluindo?.unidade.nome}
        carregando={apagando}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={() => void confirmarExclusao()}
      />
    </div>
  );
}
