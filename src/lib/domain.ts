// Mapeamentos e helpers compartilhados do domínio operacional.
// Ao adicionar um módulo novo (Manutenção, Vistoria, Atendimento,
// Administrativo), prefira criar um domain.ts próprio em
// src/modules/<modulo>/ em vez de inchar este arquivo central.

export const TAREFA_TIPO_LABEL: Record<string, string> = {
  limpeza_checkout: "Limpeza Checkout",
  limpeza_intermediaria: "Limpeza Intermediária",
  vistoria: "Vistoria",
  manutencao: "Manutenção",
  enxoval: "Enxoval",
  apoio_operacional: "Apoio Operacional",
};

export const TAREFA_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const PRIORIDADE_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const UNIDADE_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_limpeza: "Em limpeza",
  em_vistoria: "Em vistoria",
  aguardando_liberacao: "Aguardando liberação",
  liberado: "Liberado",
  bloqueado: "Bloqueado",
};

export const TIPO_IMOVEL_LABEL: Record<string, string> = {
  apartamento: "Apartamento",
  casa: "Casa",
  studio: "Studio",
  cobertura: "Cobertura",
  flat: "Flat",
};

export const TIPO_CAMA_LABEL: Record<string, string> = {
  casal: "Casal",
  solteiro: "Solteiro",
  queen: "Queen",
  king: "King",
  beliche: "Beliche",
  sofa_cama: "Sofá-cama",
  berco: "Berço",
};

export const METODO_ENTRADA_LABEL: Record<string, string> = {
  email: "E-mail",
  app: "Cadastro via aplicativo",
  app_envio_dados: "Aplicativo + envio de dados",
  whatsapp: "Cadastro via WhatsApp",
  foto_cadastro: "Foto + cadastro",
};

export const SOLICITACAO_TIPO_LABEL: Record<string, string> = {
  berco: "Berço",
  cama_extra: "Cama extra",
  enxoval_adicional: "Enxoval adicional",
  travesseiros_extras: "Travesseiros extras",
  checkin_antecipado: "Check-in antecipado",
  checkout_tardio: "Check-out tardio",
  outro: "Outro",
  senha_porta: "Senha da porta",
};

export const PRIORIDADE_BORDA: Record<string, string> = {
  baixa: "border-l-muted-foreground/40",
  media: "border-l-primary",
  alta: "border-l-warning",
  urgente: "border-l-destructive",
};

export function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["concluida", "liberado"].includes(status)) return "default";
  if (["em_andamento", "em_limpeza", "em_vistoria"].includes(status)) return "secondary";
  if (["bloqueado", "cancelada"].includes(status)) return "destructive";
  return "outline";
}

export function formatMin(mins?: number | null) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}
