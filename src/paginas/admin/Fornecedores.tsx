import { useCallback, useEffect, useState } from 'react';
import { DialogoConfirmacao, Modal } from '@/componentes/Modal';
import {
  Botao,
  Campo,
  Cartao,
  Entrada,
  EsqueletoLinhas,
  EstadoVazio,
} from '@/componentes/ui';
import { criarFornecedor, excluirFornecedor, listarFornecedores } from '@/lib/dados';
import type { Fornecedor } from '@dominio/tipos';

export function Fornecedores() {
  const [carregando, setCarregando] = useState(true);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [contatoEmail, setContatoEmail] = useState('');
  const [excluindo, setExcluindo] = useState<Fornecedor | null>(null);
  const [apagando, setApagando] = useState(false);

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

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      if (!nome.trim()) throw new Error('O fornecedor precisa de um nome.');
      await criarFornecedor({ nome, cnpj, contatoEmail });
      setNome('');
      setCnpj('');
      setContatoEmail('');
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
        <Botao onClick={() => setAberto(true)}>Novo fornecedor</Botao>
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {fornecedores.length === 0 ? (
        <EstadoVazio
          icone={<span aria-hidden="true">🏷️</span>}
          titulo="Nenhum fornecedor cadastrado"
          descricao="Cada solução do catálogo aponta para um fornecedor. Cadastre os que você já sabe que vão entrar no ciclo — dá para acrescentar outros a qualquer momento."
          acao={<Botao onClick={() => setAberto(true)}>Cadastrar o primeiro</Botao>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {fornecedores.map((f) => (
            <Cartao key={f.id} className="gap-1 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-gray-700">{f.nome}</span>
                <Botao variante="fantasma" tamanho="sm" onClick={() => setExcluindo(f)}>
                  Excluir
                </Botao>
              </div>
              {f.cnpj && <span className="font-mono text-xs text-gray-500">{f.cnpj}</span>}
              {f.contatoEmail && <span className="text-xs text-gray-500">{f.contatoEmail}</span>}
            </Cartao>
          ))}
        </div>
      )}

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Novo fornecedor"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void salvar()} carregando={salvando}>
              Cadastrar
            </Botao>
          </>
        }
      >
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
