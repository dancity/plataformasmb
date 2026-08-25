import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GradeHabilitacao } from '@/componentes/GradeHabilitacao';
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
import type { GradeHabilitacao as Grade } from '@/lib/dados';
import {
  atualizarProduto,
  criarProduto,
  excluirProduto,
  listarFornecedores,
  listarProdutos,
  listarRegionais,
  listarRegras,
  regrasParaGrade,
  salvarGrade,
} from '@/lib/dados';
import type {
  BasePreco,
  CicloCobranca,
  Fornecedor,
  Produto,
  Regional,
  RegraHabilitacao,
  Visibilidade,
} from '@dominio/tipos';
import { descreverPreco, formatarBRL, reaisParaCentavos } from '@dominio/preco';
import { useAdmin } from './LayoutAdmin';

const CATEGORIAS = [
  'Avaliação',
  'Simulados',
  'Robótica e tecnologia',
  'Socioemocional',
  'Leitura e literatura',
  'Bilinguismo',
  'Itinerários formativos',
  'Outros',
];

interface Rascunho {
  nome: string;
  fornecedorId: string;
  categoria: string;
  descricao: string;
  materialUrl: string;
  base: BasePreco;
  cicloCobranca: CicloCobranca;
  valorTexto: string;
  meses: string;
  minimoAlunos: string;
  ordem: string;
  visibilidade: Visibilidade;
}

const VAZIO: Rascunho = {
  nome: '',
  fornecedorId: '',
  categoria: CATEGORIAS[0]!,
  descricao: '',
  materialUrl: '',
  base: 'aluno',
  cicloCobranca: 'mensal',
  valorTexto: '',
  meses: '10',
  minimoAlunos: '',
  ordem: '10',
  visibilidade: 'rascunho',
};

function paraRascunho(p: Produto): Rascunho {
  return {
    nome: p.nome,
    fornecedorId: p.fornecedorId,
    categoria: p.categoria,
    descricao: p.descricao,
    materialUrl: p.materialUrl ?? '',
    base: p.precificacao.base,
    cicloCobranca: p.precificacao.ciclo,
    valorTexto: (p.precificacao.valor / 100).toFixed(2).replace('.', ','),
    meses: String(p.precificacao.meses),
    minimoAlunos: p.precificacao.minimoAlunos ? String(p.precificacao.minimoAlunos) : '',
    ordem: String(p.ordem),
    visibilidade: p.visibilidade,
  };
}

const SELO_VISIBILIDADE = {
  rascunho: { tom: 'neutro', rotulo: 'rascunho' },
  publicado: { tom: 'ok', rotulo: 'publicada' },
  suspenso: { tom: 'atencao', rotulo: 'suspensa' },
} as const;

export function Solucoes() {
  const { ciclo } = useAdmin();
  const navegar = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [regionais, setRegionais] = useState<Regional[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [editando, setEditando] = useState<Produto | null>(null);
  const [criando, setCriando] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [grade, setGrade] = useState<Grade>({});
  const [regrasAtuais, setRegrasAtuais] = useState<RegraHabilitacao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<Produto | null>(null);

  const carregar = useCallback(async () => {
    if (!ciclo) {
      setCarregando(false);
      return;
    }
    setErro(null);
    try {
      const [ps, fs, rs] = await Promise.all([
        listarProdutos(ciclo.id),
        listarFornecedores(),
        listarRegionais(),
      ]);
      setProdutos(ps);
      setFornecedores(fs);
      setRegionais(rs);
    } catch {
      setErro('Não foi possível carregar o catálogo. Recarregue a página.');
    } finally {
      setCarregando(false);
    }
  }, [ciclo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function abrirNovo() {
    setRascunho({ ...VAZIO, ordem: String((produtos.length + 1) * 10) });
    setGrade({});
    setRegrasAtuais([]);
    setEditando(null);
    setCriando(true);
  }

  async function abrirEdicao(produto: Produto) {
    const regras = await listarRegras(produto.id);
    setRegrasAtuais(regras);
    setGrade(regrasParaGrade(regras));
    setRascunho(paraRascunho(produto));
    setEditando(produto);
    setCriando(true);
  }

  function fechar() {
    setCriando(false);
    setEditando(null);
    setErro(null);
  }

  async function salvar() {
    if (!ciclo) return;
    setSalvando(true);
    setErro(null);
    try {
      if (!rascunho.nome.trim()) throw new Error('A solução precisa de um nome.');
      if (!rascunho.fornecedorId) throw new Error('Escolha o fornecedor.');

      const valor = reaisParaCentavos(rascunho.valorTexto || '0');
      if (valor <= 0) throw new Error('O preço precisa ser maior que zero.');

      const meses = Number(rascunho.meses);
      if (rascunho.cicloCobranca === 'mensal' && (!Number.isInteger(meses) || meses < 1 || meses > 12)) {
        throw new Error('Meses faturados deve ser um número de 1 a 12.');
      }

      const dados = {
        cicloId: ciclo.id,
        nome: rascunho.nome.trim(),
        fornecedorId: rascunho.fornecedorId,
        categoria: rascunho.categoria,
        descricao: rascunho.descricao.trim(),
        ...(rascunho.materialUrl.trim() ? { materialUrl: rascunho.materialUrl.trim() } : {}),
        precificacao: {
          base: rascunho.base,
          ciclo: rascunho.cicloCobranca,
          valor,
          meses: rascunho.cicloCobranca === 'mensal' ? meses : 12,
          ...(rascunho.minimoAlunos ? { minimoAlunos: Number(rascunho.minimoAlunos) } : {}),
        },
        ordem: Number(rascunho.ordem) || 0,
        visibilidade: rascunho.visibilidade,
      };

      const id = editando ? editando.id : await criarProduto(dados);
      if (editando) await atualizarProduto(id, dados);
      await salvarGrade(id, grade, regrasAtuais);

      fechar();
      await carregar();
    } catch (e) {
      setErro((e as Error).message ?? 'Não deu certo. Confira os campos.');
    } finally {
      setSalvando(false);
    }
  }

  if (!ciclo) {
    return (
      <EstadoVazio
        icone={<span aria-hidden="true">⌛</span>}
        titulo="Crie o ciclo antes do catálogo"
        descricao="Toda solução pertence a um ciclo — é isso que permite mudar preços no ano que vem sem corromper o histórico deste. Volte à aba Ciclo e crie o de 2027."
      />
    );
  }

  if (carregando) return <EsqueletoLinhas linhas={5} />;

  const nomeFornecedor = (id: string) => fornecedores.find((f) => f.id === id)?.nome ?? '—';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-brand">Soluções do ciclo {ciclo.anoAlvo}</h1>
          <p className="text-sm text-gray-500">
            A ordem aqui é a ordem em que o gestor decide, uma solução por vez. Obrigatórias
            primeiro, para ele conhecer o piso do orçamento antes de escolher qualquer opcional.
          </p>
        </div>
        <Botao onClick={() => void abrirNovo()} disabled={fornecedores.length === 0}>
          Nova solução
        </Botao>
      </div>

      {erro && !criando && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {fornecedores.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">🏷️</span>}
          titulo="Cadastre um fornecedor primeiro"
          descricao="Toda solução pertence a um fornecedor, e ele é referência de cadastro, não texto livre — é o que faz o consolidado por fornecedor sair certo em novembro, sem faxina de grafia."
          acao={
            <Botao variante="secundario" onClick={() => navegar('/admin/fornecedores')}>
              Ir para Fornecedores
            </Botao>
          }
        />
      ) : produtos.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">📦</span>}
          titulo="Nenhuma solução cadastrada"
          descricao="Cadastre as soluções que as unidades poderão contratar em 2027. Cada uma precisa de preço e de pelo menos uma combinação regional × ano escolar habilitada — sem isso ela não aparece para ninguém."
          acao={<Botao onClick={() => void abrirNovo()}>Cadastrar a primeira</Botao>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {produtos.map((p) => (
            <Cartao key={p.id} className="gap-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-brand">{p.nome}</h3>
                    <Selo tom={SELO_VISIBILIDADE[p.visibilidade].tom}>
                      {SELO_VISIBILIDADE[p.visibilidade].rotulo}
                    </Selo>
                  </div>
                  <span className="text-sm text-gray-500">
                    {nomeFornecedor(p.fornecedorId)} · {p.categoria}
                  </span>
                  <span className="font-mono text-xs text-gray-500">
                    {descreverPreco(p.precificacao)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Botao variante="secundario" tamanho="sm" onClick={() => void abrirEdicao(p)}>
                    Editar
                  </Botao>
                  <Botao variante="fantasma" tamanho="sm" onClick={() => setExcluindo(p)}>
                    Excluir
                  </Botao>
                </div>
              </div>
              {p.descricao && <p className="text-sm text-gray-500">{p.descricao}</p>}
            </Cartao>
          ))}
        </div>
      )}

      <Modal
        aberto={criando}
        aoFechar={fechar}
        largura="lg"
        titulo={editando ? 'Editar solução' : 'Nova solução'}
        descricao="Preço e habilitação nascem juntos: uma solução sem célula marcada na grade não existe para nenhuma unidade."
        rodape={
          <>
            <Botao variante="secundario" onClick={fechar} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void salvar()} carregando={salvando}>
              {editando ? 'Salvar alterações' : 'Cadastrar solução'}
            </Botao>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome da solução" obrigatorio>
            <Entrada
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              placeholder="Robótica Educacional"
            />
          </Campo>

          <Campo rotulo="Fornecedor" obrigatorio>
            <Selecao
              value={rascunho.fornecedorId}
              onChange={(e) => setRascunho({ ...rascunho, fornecedorId: e.target.value })}
            >
              <option value="">Escolha…</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Categoria" dica="Agrupa o catálogo e alerta sobre soluções sobrepostas.">
            <Selecao
              value={rascunho.categoria}
              onChange={(e) => setRascunho({ ...rascunho, categoria: e.target.value })}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Ordem na escolha" dica="Menor aparece primeiro.">
            <Entrada
              type="number"
              value={rascunho.ordem}
              onChange={(e) => setRascunho({ ...rascunho, ordem: e.target.value })}
            />
          </Campo>
        </div>

        <Campo
          rotulo="Descrição"
          dica="Um parágrafo. É o que o gestor lê antes de decidir se contrata."
        >
          <textarea
            value={rascunho.descricao}
            onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-medium focus:outline-none"
            placeholder="Kits e trilha curricular de robótica com formação de professores."
          />
        </Campo>

        <Campo rotulo="Link do material do fornecedor" dica="Opcional. PDF ou página.">
          <Entrada
            type="url"
            value={rascunho.materialUrl}
            onChange={(e) => setRascunho({ ...rascunho, materialUrl: e.target.value })}
            placeholder="https://"
          />
        </Campo>

        <fieldset className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4">
          <legend className="px-1 text-sm font-medium text-gray-700">Preço</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Cobrado por">
              <Selecao
                value={rascunho.base}
                onChange={(e) => setRascunho({ ...rascunho, base: e.target.value as BasePreco })}
              >
                <option value="aluno">Aluno</option>
                <option value="escola">Escola (unidade inteira)</option>
                <option value="turma">Turma</option>
              </Selecao>
            </Campo>

            <Campo rotulo="Periodicidade">
              <Selecao
                value={rascunho.cicloCobranca}
                onChange={(e) =>
                  setRascunho({ ...rascunho, cicloCobranca: e.target.value as CicloCobranca })
                }
              >
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </Selecao>
            </Campo>

            <Campo rotulo="Valor em reais" obrigatorio>
              <Entrada
                value={rascunho.valorTexto}
                onChange={(e) => setRascunho({ ...rascunho, valorTexto: e.target.value })}
                placeholder="15,00"
                inputMode="decimal"
              />
            </Campo>

            {rascunho.cicloCobranca === 'mensal' && (
              <Campo
                rotulo="Meses faturados"
                dica="Solução educacional raramente cobra 12. Chutar 12 infla o orçamento da rede."
              >
                <Entrada
                  type="number"
                  min={1}
                  max={12}
                  value={rascunho.meses}
                  onChange={(e) => setRascunho({ ...rascunho, meses: e.target.value })}
                />
              </Campo>
            )}

            {rascunho.base === 'aluno' && (
              <Campo rotulo="Mínimo de alunos" dica="Opcional. Abaixo disso, cobra-se o mínimo.">
                <Entrada
                  type="number"
                  min={0}
                  value={rascunho.minimoAlunos}
                  onChange={(e) => setRascunho({ ...rascunho, minimoAlunos: e.target.value })}
                  placeholder="sem mínimo"
                />
              </Campo>
            )}
          </div>

          <p className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700">
            O gestor vai ler:{' '}
            <strong>
              {(() => {
                try {
                  const valor = reaisParaCentavos(rascunho.valorTexto || '0');
                  return descreverPreco({
                    base: rascunho.base,
                    ciclo: rascunho.cicloCobranca,
                    valor,
                    meses: Number(rascunho.meses) || 12,
                  });
                } catch {
                  return 'valor inválido';
                }
              })()}
            </strong>
            {rascunho.base === 'escola' && (
              <> — marcar mais anos escolares não muda esse valor.</>
            )}
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4">
          <legend className="px-1 text-sm font-medium text-gray-700">
            Onde pode ser contratada
          </legend>
          {regionais.length === 0 ? (
            <p className="text-sm text-gray-500">
              Cadastre as regionais na aba Ciclo antes de habilitar a solução.
            </p>
          ) : (
            <GradeHabilitacao regionais={regionais} grade={grade} aoMudar={setGrade} />
          )}
        </fieldset>

        <Campo
          rotulo="Visibilidade"
          dica="Publicada é o que aparece para as unidades quando o ciclo abrir. Cadastrar não deveria publicar."
        >
          <Selecao
            value={rascunho.visibilidade}
            onChange={(e) =>
              setRascunho({ ...rascunho, visibilidade: e.target.value as Visibilidade })
            }
          >
            <option value="rascunho">Rascunho — só a administração vê</option>
            <option value="publicado">Publicada — visível para as unidades</option>
            <option value="suspenso">Suspensa — retirada do catálogo</option>
          </Selecao>
        </Campo>

        {erro && (
          <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {erro}
          </p>
        )}
      </Modal>

      <DialogoConfirmacao
        aberto={!!excluindo}
        nivel="perigo"
        titulo="Excluir solução"
        descricao="A solução e todas as suas regras de habilitação saem do catálogo."
        detalhe={
          excluindo && (
            <div className="flex flex-col gap-1">
              <span>
                <strong>{excluindo.nome}</strong> · {nomeFornecedor(excluindo.fornecedorId)}
              </span>
              <span>{descreverPreco(excluindo.precificacao)}</span>
              <span className="text-xs">
                Pedidos já enviados não mudam: eles guardam cópia do preço e dos anos escolhidos.
              </span>
            </div>
          )
        }
        textoConfirmar="Excluir solução"
        nomeParaDigitar={excluindo?.nome}
        carregando={salvando}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={() => {
          const alvo = excluindo;
          if (!alvo) return;
          setExcluindo(null);
          setSalvando(true);
          void excluirProduto(alvo.id)
            .then(carregar)
            .catch(() => setErro('Não foi possível excluir. Tente de novo.'))
            .finally(() => setSalvando(false));
        }}
      />

      {produtos.length > 0 && (
        <p className="text-xs text-gray-500">
          Total do catálogo: {produtos.length} soluç{produtos.length === 1 ? 'ão' : 'ões'} ·{' '}
          {produtos.filter((p) => p.visibilidade === 'publicado').length} publicada(s) ·{' '}
          preço médio por unidade de cobrança{' '}
          {formatarBRL(
            Math.round(
              produtos.reduce((s, p) => s + p.precificacao.valor, 0) / Math.max(produtos.length, 1),
            ),
          )}
        </p>
      )}
    </div>
  );
}
