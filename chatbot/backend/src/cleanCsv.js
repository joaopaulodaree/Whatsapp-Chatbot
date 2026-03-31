const fs = require('fs');

/**
 * Função para limpar um arquivo CSV removendo colunas específicas.
 * @param {string} inputPath - Caminho do arquivo CSV de entrada.
 * @param {string} outputPath - Caminho do arquivo CSV de saída limpo.
 * @param {number[]} columnsToRemove - Array de índices 0-based das colunas a remover.
 */
function cleanCsv(inputPath, outputPath, columnsToRemove) {
  try {
    // Lê o arquivo de entrada
    const data = fs.readFileSync(inputPath, 'utf8');
    
    // Divide em linhas
    const lines = data.split('\n');
    
    // Processa cada linha
    const cleanedLines = lines.map(line => {
      if (!line.trim()) return line; // Mantém linhas vazias
      
      // Divide em colunas por ';'
      const cols = line.split(';');
      
      // Filtra as colunas a manter
      const keptCols = cols.filter((_, index) => !columnsToRemove.includes(index));
      
      // Junta de volta
      return keptCols.join(';');
    });
    
    // Escreve o arquivo de saída
    fs.writeFileSync(outputPath, cleanedLines.join('\n'), 'utf8');
    
    console.log(`Arquivo limpo salvo em: ${outputPath}`);
  } catch (error) {
    console.error('Erro ao limpar o CSV:', error.message);
  }
}

module.exports = cleanCsv;