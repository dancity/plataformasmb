import { useCallback, useEffect, useRef, useState } from 'react';
import { DialogoConfirmacao, Modal } from '@/componentes/Modal';
import {
  Botao,
  Campo,
  Cartao,
  Entrada,
  EsqueletoLinhas,
  EstadoVazio,
  LogoFornecedor,
} from '@/componentes/ui';
import {
  atualizarFornecedor,
  criarFornecedor,
  excluirFornecedor,
  listarFornecedores,
} from '@/lib/dados';
import { prepararLogoQuadrado } from '@/lib/imagem';
import type { Fornecedor } from '@dominio/tipos';

export function Fornecedores() {
  const [carregando, setCarregando] = useState(true);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [contatoEmail, setContatoEmail] = useState('');
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [processandoLogo, setProcessandoLogo] = useState(false);
  const [excluindo, setExcluindo] = useState<Fornecedor | null>(null);
  const [apagando, setApagando] = useState(false);
  const seletorArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      setFornecedores(await listarFornecedores());
    } catch {
      setErro('Não foi possível carregar os fornecedores.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditando(null);
    setNome('');
    setCnpj('');
    setContatoEmail('');
    setLogo(undefined);
    setErro(null);
    setAberto(true);
  }

  function abrirEdicao(f: Fornecedor) {
    setEditando(f);
    setNome(f.nome);
    setCnpj(f.cnpj ?? '');
    setContatoEmail(f.contatoEmail ?? '');
    setLogo(f.logo);
    setErro(null);
    setAberto(true);
  }

  async function escolherLogo(arquivo: File | undefined) {
    if (!arquivo) return;
    setProcessandoLogo(true);
    setErro(null);
    try {
      // Recorta e reduz aqui, antes de qualquer gravação: o que entra na
      // pré-visualização é exatamente o que vai para o banco.
      setLogo(await prepararLogoQuadrado(arquivo));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setProcessandoLogo(false);
      if (seletorArquivo.current) seletorArquivo.current.value = '';
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      if (!nome.trim()) throw new Error('O fornecedor precisa de um nome.');
      const dados = { nome, cnpj, contatoEmail, logo };
      if (editando) await atualizarFornecedor(editando.id, dados);
      else await criarFornecedor(dados);
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
          <h1 className="text-xl font-semibold text-brand">Fornecedores</h1>
          <p className="text-sm text-gray-500">
            Cadastro próprio, não texto livre em cada solução — é o que faz o consolidado por
            fornecedor sair certo, sem duas grafias do mesmo nome virarem duas linhas.
          </p>
        </div>
        <Botao onClick={abrirNovo}>Novo fornecedor</Botao>
      </div>

      {erro && !aberto && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {fornecedores.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">🏷️</span>}
          titulo="Nenhum fornecedor cadastrado"
          descricao="Cada solução do catálogo aponta para um fornecedor. Cadastre os que você já sabe que vão entrar no ciclo — dá para acrescentar outros a qualquer momento."
          acao={<Botao onClick={abrirNovo}>Cadastrar o primeiro</Botao>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {fornecedores.map((f) => (
            <Cartao key={f.id} className="flex-row items-start gap-3 p-4">
              <LogoFornecedor nome={f.nome} logo={f.logo} tamanho="md" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium text-gray-700">{f.nome}</span>
                {f.cnpj && <span className="font-mono text-xs text-gray-500">{f.cnpj}</span>}
                {f.contatoEmail && (
                  <span className="truncate text-xs text-gray-500">{f.contatoEmail}</span>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Botao variante="secundario" tamanho="sm" onClick={() => abrirEdicao(f)}>
                  Editar
                </Botao>
                <Botao variante="fantasma" tamanho="sm" onClick={() => setExcluindo(f)}>
                  Excluir
                </Botao>
              </div>
            </Cartao>
          ))}
        </div>
      )}

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={editando ? `Editar ${editando.nome}` : 'Novo fornecedor'}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void salvar()} carregando={salvando} disabled={processandoLogo}>
              {editando ? 'Salvar' : 'Cadastrar'}
            </Botao>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 p-4">
          <LogoFornecedor nome={nome || '?'} logo={logo} tamanho="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-gray-700">Marca do fornecedor</span>
              <span className="text-xs text-gray-500">
                Quadrada. Imagem retangular é recortada pelo centro, e o arquivo é reduzido antes
                de salvar — mande a melhor que tiver.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Botao
                variante="secundario"
                tamanho="sm"
                carregando={processandoLogo}
                onClick={() => seletorArquivo.current?.click()}
              >
                {logo ? 'Trocar imagem' : 'Escolher imagem'}
              </Botao>
              {logo && (
                <Botao variante="fantasma" tamanho="sm" onClick={() => setLogo(undefined)}>
                  Remover
                </Botao>
              )}
            </div>
            <input
              ref={seletorArquivo}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => void escolherLogo(e.target.files?.[0])}
            />
          </div>
        </div>

        <Campo rotulo="Nome" obrigatorio>
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="MakerLab" />
        </Campo>
        <Campo rotulo="CNPJ" dica="Opcional — útil na hora do contrato.">
          <Entrada value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        </Campo>
        <Campo rotulo="E-mail de contato" dica="Opcional.">
          <Entrada
            type="email"
            value={contatoEmail}
            onChange={(e) => setContatoEmail(e.target.value)}
          />
        </Campo>
        {erro && (
          <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {erro}
          </p>
        )}
      </Modal>

      <DialogoConfirmacao
        aberto={!!excluindo}
        nivel="medio"
        titulo="Excluir fornecedor"
        descricao="Soluções que já apontam para este fornecedor passam a mostrar “—” no lugar do nome — elas não são excluídas nem perdem preço ou habilitação."
        detalhe={excluindo && <span className="font-medium">{excluindo.nome}</span>}
        textoConfirmar="Excluir fornecedor"
        carregando={apagando}
        aoCancelar={() => setExcluindo(null)}
        aoConfirmar={() => {
          const alvo = excluindo;
          if (!alvo) return;
          setExcluindo(null);
          setApagando(true);
          void excluirFornecedor(alvo.id)
            .then(carregar)
            .catch(() => setErro('Não foi possível excluir. Tente de novo.'))
            .finally(() => setApagando(false));
        }}
      />
    </div>
  );
}
