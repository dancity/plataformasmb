import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GradeHabilitacao } from '@/componentes/GradeHabilitacao';
import { Botao, Campo, Entrada, EsqueletoLinhas, EstadoVazio, Selecao } from '@/componentes/ui';
import type { GradeHabilitacao as Grade } from '@/lib/dados';
import {
  atualizarProduto,
  criarProduto,
  listarFornecedores,
  listarRegionais,
  listarRegras,
  obterProduto,
  regrasParaGrade,
  salvarGrade,
} from '@/lib/dados';
import type {
  BasePreco,
  CicloCobranca,
  Fornecedor,
  Precificacao,
  Regional,
  RegraHabilitacao,
  Visibilidade,
} from '@dominio/tipos';
import { descreverPreco, reaisParaCentavos } from '@dominio/preco';
import { useAdmin } from './LayoutAdmin';

/**
 * Cadastro de solução, em página cheia — não em modal. A grade regional × ano
 * escolar é larga (17 colunas) e o formulário é comprido; espremer os dois
 * numa caixa de altura fixa é o tipo de coisa que só aparece testando de
 * verdade, com dado de verdade. Página inteira rola do jeito normal do
 * navegador, sem inventar scroll dentro de scroll.
 */

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
  precoSocialHabilitado: boolean;
  baseSocial: BasePreco;
  cicloCobrancaSocial: CicloCobranca;
  valorTextoSocial: string;
  mesesSocial: string;
  minimoAlunosSocial: string;
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
  precoSocialHabilitado: false,
  baseSocial: 'aluno',
  cicloCobrancaSocial: 'mensal',
  valorTextoSocial: '',
  mesesSocial: '10',
  minimoAlunosSocial: '',
};

/** Grupo "cobrado por / periodicidade / valor / meses / mínimo" — o mesmo
 * pra preço normal e preço social, só que endereçado a campos diferentes do
 * rascunho. */
function CamposPreco({
  base,
  cicloCobranca,
  valorTexto,
  meses,
  minimoAlunos,
  rotuloValor,
  aoMudarBase,
  aoMudarCiclo,
  aoMudarValor,
  aoMudarMeses,
  aoMudarMinimo,
}: {
  base: BasePreco;
  cicloCobranca: CicloCobranca;
  valorTexto: string;
  meses: string;
  minimoAlunos: string;
  rotuloValor: string;
  aoMudarBase: (v: BasePreco) => void;
  aoMudarCiclo: (v: CicloCobranca) => void;
  aoMudarValor: (v: string) => void;
  aoMudarMeses: (v: string) => void;
  aoMudarMinimo: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo rotulo="Cobrado por">
        <Selecao value={base} onChange={(e) => aoMudarBase(e.target.value as BasePreco)}>
          <option value="aluno">Aluno</option>
          <option value="escola">Escola (unidade inteira)</option>
          <option value="turma">Turma</option>
          <option value="credito">Créditos</option>
        </Selecao>
      </Campo>

      <Campo rotulo="Periodicidade">
        <Selecao
          value={cicloCobranca}
          onChange={(e) => aoMudarCiclo(e.target.value as CicloCobranca)}
        >
          <option value="mensal">Mensal</option>
          <option value="anual">Anual</option>
        </Selecao>
      </Campo>

      <Campo rotulo={base === 'credito' ? `${rotuloValor}, por crédito` : rotuloValor} obrigatorio>
        <Entrada
          value={valorTexto}
          onChange={(e) => aoMudarValor(e.target.value)}
          placeholder="15,00"
          inputMode="decimal"
        />
      </Campo>

      {cicloCobranca === 'mensal' && (
        <Campo
          rotulo="Meses faturados"
          dica="Solução educacional raramente cobra 12. Chutar 12 infla o orçamento da rede."
        >
          <Entrada
            type="number"
            min={1}
            max={12}
            value={meses}
            onChange={(e) => aoMudarMeses(e.target.value)}
          />
        </Campo>
      )}

      {base === 'aluno' && (
        <Campo rotulo="Mínimo de alunos" dica="Opcional. Abaixo disso, cobra-se o mínimo.">
          <Entrada
            type="number"
            min={0}
            value={minimoAlunos}
            onChange={(e) => aoMudarMinimo(e.target.value)}
            placeholder="sem mínimo"
          />
        </Campo>
      )}
    </div>
  );
}

export function SolucaoForm() {
  const { ciclo } = useAdmin();
  const navegar = useNavigate();
  const { produtoId } = useParams<{ produtoId: string }>();
  const editando = !!produtoId;

  const [carregando, setCarregando] = useState(true);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [regionais, setRegionais] = useState<Regional[]>([]);
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [grade, setGrade] = useState<Grade>({});
  const [regrasAtuais, setRegrasAtuais] = useState<RegraHabilitacao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  const carregar = useCallback(async () => {
    if (!ciclo) {
      setCarregando(false);
      return;
    }
    try {
      const [fs, rs] = await Promise.all([listarFornecedores(), listarRegionais()]);
      setFornecedores(fs);
      setRegionais(rs);

      if (produtoId) {
        const [produto, regras] = await Promise.all([
          obterProduto(produtoId),
          listarRegras(produtoId),
        ]);
        if (!produto) {
          setNaoEncontrada(true);
          return;
        }
        setRegrasAtuais(regras);
        setGrade(regrasParaGrade(regras));
        const social = produto.precificacaoSocial;
        setRascunho({
          nome: produto.nome,
          fornecedorId: produto.fornecedorId,
          categoria: produto.categoria,
          descricao: produto.descricao,
          materialUrl: produto.materialUrl ?? '',
          base: produto.precificacao.base,
          cicloCobranca: produto.precificacao.ciclo,
          valorTexto: (produto.precificacao.valor / 100).toFixed(2).replace('.', ','),
          meses: String(produto.precificacao.meses),
          minimoAlunos: produto.precificacao.minimoAlunos
            ? String(produto.precificacao.minimoAlunos)
            : '',
          ordem: String(produto.ordem),
          visibilidade: produto.visibilidade,
          precoSocialHabilitado: produto.precoSocialHabilitado ?? false,
          baseSocial: social?.base ?? produto.precificacao.base,
          cicloCobrancaSocial: social?.ciclo ?? produto.precificacao.ciclo,
          valorTextoSocial: social ? (social.valor / 100).toFixed(2).replace('.', ',') : '',
          mesesSocial: String(social?.meses ?? 10),
          minimoAlunosSocial: social?.minimoAlunos ? String(social.minimoAlunos) : '',
        });
      }
    } catch {
      setErro('Não foi possível carregar os dados. Recarregue a página.');
    } finally {
      setCarregando(false);
    }
  }, [ciclo, produtoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

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

      // Preço social: exigido e validado só quando habilitado. Desabilitado
      // com algo digitado, o valor é preservado (best-effort) pra não sumir
      // se a administração religar depois — só não entra se não parsear.
      let precificacaoSocial: Precificacao | undefined;
      if (rascunho.precoSocialHabilitado) {
        const valorSocial = reaisParaCentavos(rascunho.valorTextoSocial || '0');
        if (valorSocial <= 0) throw new Error('O preço social precisa ser maior que zero.');
        const mesesSocial = Number(rascunho.mesesSocial);
        if (
          rascunho.cicloCobrancaSocial === 'mensal' &&
          (!Number.isInteger(mesesSocial) || mesesSocial < 1 || mesesSocial > 12)
        ) {
          throw new Error('Meses faturados do preço social deve ser um número de 1 a 12.');
        }
        precificacaoSocial = {
          base: rascunho.baseSocial,
          ciclo: rascunho.cicloCobrancaSocial,
          valor: valorSocial,
          meses: rascunho.cicloCobrancaSocial === 'mensal' ? mesesSocial : 12,
          ...(rascunho.baseSocial === 'aluno' && rascunho.minimoAlunosSocial
            ? { minimoAlunos: Number(rascunho.minimoAlunosSocial) }
            : {}),
        };
      } else if (rascunho.valorTextoSocial.trim()) {
        try {
          const valorSocial = reaisParaCentavos(rascunho.valorTextoSocial);
          if (valorSocial > 0) {
            const mesesSocial = Number(rascunho.mesesSocial);
            precificacaoSocial = {
              base: rascunho.baseSocial,
              ciclo: rascunho.cicloCobrancaSocial,
              valor: valorSocial,
              meses:
                rascunho.cicloCobrancaSocial === 'mensal' &&
                Number.isInteger(mesesSocial) &&
                mesesSocial >= 1 &&
                mesesSocial <= 12
                  ? mesesSocial
                  : 12,
              ...(rascunho.baseSocial === 'aluno' && rascunho.minimoAlunosSocial
                ? { minimoAlunos: Number(rascunho.minimoAlunosSocial) }
                : {}),
            };
          }
        } catch {
          // Não parseou — segue sem preço social, sem travar o salvamento.
        }
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
          ...(rascunho.base === 'aluno' && rascunho.minimoAlunos
            ? { minimoAlunos: Number(rascunho.minimoAlunos) }
            : {}),
        },
        precoSocialHabilitado: rascunho.precoSocialHabilitado,
        ...(precificacaoSocial ? { precificacaoSocial } : {}),
        ordem: Number(rascunho.ordem) || 0,
        visibilidade: rascunho.visibilidade,
      };

      const id = editando ? produtoId! : await criarProduto(dados);
      if (editando) await atualizarProduto(id, dados);
      await salvarGrade(id, grade, regrasAtuais);

      navegar('/admin/solucoes');
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
        descricao="Volte à aba Ciclo e crie o ciclo antes de cadastrar soluções."
      />
    );
  }

  if (carregando) return <EsqueletoLinhas linhas={8} />;

  if (naoEncontrada) {
    return (
      <EstadoVazio
        icone={<span aria-hidden="true">🔍</span>}
        titulo="Solução não encontrada"
        descricao="Ela pode ter sido excluída. Volte para a lista e tente de novo."
        acao={<Botao onClick={() => navegar('/admin/solucoes')}>Voltar para Soluções</Botao>}
      />
    );
  }

  const previaPreco = (() => {
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
  })();

  const previaPrecoSocial = (() => {
    try {
      const valor = reaisParaCentavos(rascunho.valorTextoSocial || '0');
      return descreverPreco({
        base: rascunho.baseSocial,
        ciclo: rascunho.cicloCobrancaSocial,
        valor,
        meses: Number(rascunho.mesesSocial) || 12,
      });
    } catch {
      return 'valor inválido';
    }
  })();

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => navegar('/admin/solucoes')}
          className="w-fit text-sm text-gray-500 hover:text-gray-700"
        >
          ← Voltar para Soluções
        </button>
        <h1 className="text-xl font-semibold text-brand">
          {editando ? 'Editar solução' : 'Nova solução'}
        </h1>
        <p className="text-sm text-gray-500">
          Preço e habilitação nascem juntos: uma solução sem célula marcada na grade não existe
          para nenhuma unidade.
        </p>
      </div>

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

      <Campo rotulo="Descrição" dica="Um parágrafo. É o que o gestor lê antes de decidir se contrata.">
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

        <CamposPreco
          base={rascunho.base}
          cicloCobranca={rascunho.cicloCobranca}
          valorTexto={rascunho.valorTexto}
          meses={rascunho.meses}
          minimoAlunos={rascunho.minimoAlunos}
          rotuloValor="Valor em reais"
          aoMudarBase={(base) => setRascunho({ ...rascunho, base })}
          aoMudarCiclo={(cicloCobranca) => setRascunho({ ...rascunho, cicloCobranca })}
          aoMudarValor={(valorTexto) => setRascunho({ ...rascunho, valorTexto })}
          aoMudarMeses={(meses) => setRascunho({ ...rascunho, meses })}
          aoMudarMinimo={(minimoAlunos) => setRascunho({ ...rascunho, minimoAlunos })}
        />

        <p className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700">
          O gestor vai ler: <strong>{previaPreco}</strong>
          {rascunho.base === 'escola' && <> — marcar mais anos escolares não muda esse valor.</>}
          {rascunho.base === 'credito' && (
            <> — e digita a quantidade de créditos de cada ano escolar na hora de contratar.</>
          )}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4">
        <legend className="px-1 text-sm font-medium text-gray-700">Preço social</legend>

        <label className="flex items-center gap-2.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={rascunho.precoSocialHabilitado}
            onChange={(e) => setRascunho({ ...rascunho, precoSocialHabilitado: e.target.checked })}
            className="h-4 w-4 accent-[var(--color-brand-medium)]"
          />
          Esta solução tem um preço diferente para unidade social
        </label>
        <p className="-mt-2 text-xs text-gray-500">
          Não é desconto sobre o preço acima — é outro preço inteiro, que substitui o normal por
          completo pra quem contrata a partir de uma unidade marcada como social (cadastro de
          Unidades). Desabilitado, a unidade social paga o preço normal, igual a qualquer outra.
        </p>

        {rascunho.precoSocialHabilitado && (
          <>
            <CamposPreco
              base={rascunho.baseSocial}
              cicloCobranca={rascunho.cicloCobrancaSocial}
              valorTexto={rascunho.valorTextoSocial}
              meses={rascunho.mesesSocial}
              minimoAlunos={rascunho.minimoAlunosSocial}
              rotuloValor="Valor social em reais"
              aoMudarBase={(baseSocial) => setRascunho({ ...rascunho, baseSocial })}
              aoMudarCiclo={(cicloCobrancaSocial) =>
                setRascunho({ ...rascunho, cicloCobrancaSocial })
              }
              aoMudarValor={(valorTextoSocial) => setRascunho({ ...rascunho, valorTextoSocial })}
              aoMudarMeses={(mesesSocial) => setRascunho({ ...rascunho, mesesSocial })}
              aoMudarMinimo={(minimoAlunosSocial) =>
                setRascunho({ ...rascunho, minimoAlunosSocial })
              }
            />
            <p className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700">
              Unidade social vai ler: <strong>{previaPrecoSocial}</strong>
            </p>
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4">
        <legend className="px-1 text-sm font-medium text-gray-700">Onde pode ser contratada</legend>
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
          onChange={(e) => setRascunho({ ...rascunho, visibilidade: e.target.value as Visibilidade })}
        >
          <option value="rascunho">Rascunho — só a administração vê</option>
          <option value="publicado">Publicada — visível para as unidades</option>
          <option value="suspenso">Suspensa — retirada do catálogo</option>
        </Selecao>
      </Campo>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {/* Barra de ação fixa: em formulário comprido, rolar até o fim pra
          salvar é fricção que ninguém pediu. */}
      <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-gray-200 bg-white/95 px-6 py-3 backdrop-blur-sm">
        <Botao variante="secundario" onClick={() => navegar('/admin/solucoes')} disabled={salvando}>
          Cancelar
        </Botao>
        <Botao onClick={() => void salvar()} carregando={salvando}>
          {editando ? 'Salvar alterações' : 'Cadastrar solução'}
        </Botao>
      </div>
    </div>
  );
}
