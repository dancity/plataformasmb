/**
 * Preparo de imagem no cliente.
 *
 * O arquivo que a pessoa escolhe quase nunca é o que deve ser guardado: vem
 * retangular, em 4000px, com megabytes de foto. Aqui ele vira sempre a mesma
 * coisa — quadrado, pequeno, leve — antes de chegar ao banco. Recortar na
 * gravação, e não na exibição, é o que garante que a marca apareça igual em
 * toda tela: a de admin, a do gestor, a lista e o card.
 */

/** Lado do quadrado gravado. 256 cobre o maior uso (tile de 56px) com folga
 *  de tela retina, sem virar um documento gordo. */
const LADO = 256;

/** Teto do que pode ir pro documento. O limite do Firestore é 1 MB por
 *  documento, mas o que manda aqui é outro número: a tela do gestor lê o
 *  cadastro INTEIRO de fornecedores de uma vez, então cada marca pesa no
 *  carregamento de toda unidade. 64 KB por marca mantém o catálogo inteiro
 *  na casa das centenas de KB mesmo com dezenas de fornecedores. */
const LIMITE_BYTES = 64 * 1024;

/** Barreira antes de decodificar: arquivo maior que isto é foto de câmera,
 *  não logo, e decodificar só pra descobrir custa memória do navegador. */
const LIMITE_ARQUIVO_BYTES = 12 * 1024 * 1024;

/** Tentativas em ordem de preferência. WebP ganha em tamanho e mantém
 *  transparência; PNG é o refúgio de quem não tem WebP; JPEG só no fim,
 *  porque achata o fundo transparente em branco. */
const FORMATOS: { tipo: string; qualidade?: number; achataFundo?: boolean }[] = [
  { tipo: 'image/webp', qualidade: 0.92 },
  { tipo: 'image/webp', qualidade: 0.8 },
  { tipo: 'image/webp', qualidade: 0.65 },
  { tipo: 'image/png' },
  { tipo: 'image/jpeg', qualidade: 0.85, achataFundo: true },
  { tipo: 'image/jpeg', qualidade: 0.7, achataFundo: true },
];

function bytesDoDataUrl(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  // 4 caracteres base64 = 3 bytes, menos o padding do fim.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Decodifica o arquivo. `createImageBitmap` é o caminho rápido; a tag <img>
 *  é o que resta em navegador que não o tenha, ou em formato que ele recuse. */
async function decodificar(arquivo: File): Promise<{
  fonte: CanvasImageSource;
  largura: number;
  altura: number;
  encerrar: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(arquivo);
      return {
        fonte: bitmap,
        largura: bitmap.width,
        altura: bitmap.height,
        encerrar: () => bitmap.close(),
      };
    } catch {
      /* segue pro caminho da tag <img> */
    }
  }

  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decodificação falhou'));
      el.src = url;
    });
    return {
      fonte: img,
      largura: img.naturalWidth,
      altura: img.naturalHeight,
      encerrar: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * Transforma o arquivo escolhido num quadrado de {@link LADO}px, em data URI.
 * O recorte é central: imagem retangular perde as pontas do lado maior, que é
 * o que a pessoa espera ao ver o quadrado da pré-visualização.
 *
 * Lança erro com texto pronto pra tela — a chamada só precisa exibir.
 */
export async function prepararLogoQuadrado(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem (PNG, JPG, WebP ou SVG).');
  }
  if (arquivo.size > LIMITE_ARQUIVO_BYTES) {
    throw new Error('A imagem é grande demais. Use um arquivo de até 12 MB.');
  }

  const { fonte, largura, altura, encerrar } = await decodificar(arquivo).catch(() => {
    throw new Error('Não foi possível abrir esta imagem. Tente exportá-la como PNG ou JPG.');
  });

  try {
    if (largura === 0 || altura === 0) {
      throw new Error('Não foi possível abrir esta imagem. Tente exportá-la como PNG ou JPG.');
    }

    const lado = Math.min(largura, altura);
    const origemX = (largura - lado) / 2;
    const origemY = (altura - lado) / 2;

    const tela = document.createElement('canvas');
    tela.width = LADO;
    tela.height = LADO;
    const pincel = tela.getContext('2d');
    if (!pincel) throw new Error('Não foi possível processar a imagem neste navegador.');
    pincel.imageSmoothingQuality = 'high';

    for (const formato of FORMATOS) {
      pincel.clearRect(0, 0, LADO, LADO);
      if (formato.achataFundo) {
        pincel.fillStyle = '#ffffff';
        pincel.fillRect(0, 0, LADO, LADO);
      }
      pincel.drawImage(fonte, origemX, origemY, lado, lado, 0, 0, LADO, LADO);

      const dataUrl = tela.toDataURL(formato.tipo, formato.qualidade);
      // Navegador sem suporte devolve PNG caladamente, com outro prefixo —
      // aceitar isso levaria um PNG gigante achando que é WebP.
      if (!dataUrl.startsWith(`data:${formato.tipo}`)) continue;
      if (bytesDoDataUrl(dataUrl) <= LIMITE_BYTES) return dataUrl;
    }

    throw new Error('Não foi possível reduzir esta imagem o bastante. Tente uma mais simples.');
  } finally {
    encerrar();
  }
}
