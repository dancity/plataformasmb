/**
 * Texto livre → identificador de documento: minúsculo, sem acento, só
 * `a-z0-9` separado por hífen. Usado tanto no cadastro manual de unidade
 * quanto na importação em lote, pra gerar o mesmo id a partir do mesmo nome
 * nos dois caminhos.
 */
export function slugificar(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento isoladas pelo NFKD
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
