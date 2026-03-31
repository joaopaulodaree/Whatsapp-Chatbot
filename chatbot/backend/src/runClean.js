const cleanCsv = require('./cleanCsv');

// Caminhos dos arquivos
const inputPath = 'D:\\Users\\Windows\\Documents\\JoaoPaulo\\Souarte.CSV';
const outputPath = 'D:\\Users\\Windows\\Documents\\JoaoPaulo\\Souarte_cleaned.CSV';

// Colunas a remover (0-based): 0,1,5,6,7,12,13,14,15,16,17,18,24,25,26,27,28,29,30,31,32
const columnsToRemove = [0, 1, 5, 6, 7, 12, 13, 14, 15, 16, 17, 18, 24, 25, 26, 27, 28, 29, 30, 31, 32];

// Executa a limpeza
cleanCsv(inputPath, outputPath, columnsToRemove);