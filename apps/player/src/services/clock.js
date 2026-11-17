// Diferença entre o relógio da TV e o do servidor (medida no sinal de vida). O cronômetro usa
// para todas as TVs da academia mostrarem o mesmo tempo.
let offset = 0;
export const setClockOffset = (ms) => { offset = Number(ms) || 0; };
export const clockOffset = () => offset;
