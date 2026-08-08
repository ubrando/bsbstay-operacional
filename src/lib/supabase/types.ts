// Gerado manualmente a partir de supabase/migrations/0001_init.sql.
// Assim que o projeto Supabase real existir, regenerar com:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          nome_completo: string
          telefone: string | null
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nome_completo?: string
          telefone?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>
        Relationships: []
      }
      user_roles: {
        Row: { id: string; user_id: string; role: Database["public"]["Enums"]["app_role"]; created_at: string }
        Insert: { id?: string; user_id: string; role: Database["public"]["Enums"]["app_role"]; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Insert"]>
        Relationships: []
      }
      unidades: {
        Row: {
          id: string
          codigo: string
          nome: string
          endereco: string
          regiao: string
          tipo: Database["public"]["Enums"]["tipo_imovel"]
          quartos: number
          banheiros: number
          capacidade: number
          tempo_limpeza_min: number
          observacoes: string | null
          status: Database["public"]["Enums"]["unidade_status"]
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          codigo: string
          nome: string
          endereco: string
          regiao: string
          tipo?: Database["public"]["Enums"]["tipo_imovel"]
          quartos?: number
          banheiros?: number
          capacidade?: number
          tempo_limpeza_min?: number
          observacoes?: string | null
          status?: Database["public"]["Enums"]["unidade_status"]
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["unidades"]["Insert"]>
        Relationships: []
      }
      quartos_config: {
        Row: {
          id: string
          unidade_id: string
          nome: string
          tipo_cama: Database["public"]["Enums"]["tipo_cama"]
          quantidade: number
          cama_extra: boolean
          observacoes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          unidade_id: string
          nome: string
          tipo_cama: Database["public"]["Enums"]["tipo_cama"]
          quantidade?: number
          cama_extra?: boolean
          observacoes?: string | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["quartos_config"]["Insert"]>
        Relationships: [
          { foreignKeyName: "quartos_config_unidade_id_fkey"; columns: ["unidade_id"]; isOneToOne: false; referencedRelation: "unidades"; referencedColumns: ["id"] },
        ]
      }
      tarefas: {
        Row: {
          id: string
          unidade_id: string
          tipo: Database["public"]["Enums"]["tarefa_tipo"]
          prioridade: Database["public"]["Enums"]["tarefa_prioridade"]
          status: Database["public"]["Enums"]["tarefa_status"]
          responsavel_id: string | null
          vistoriador_id: string | null
          ordem_dia: number | null
          data_prevista: string
          hora_prevista: string | null
          iniciado_em: string | null
          finalizado_em: string | null
          tempo_total_min: number | null
          hospedes: number | null
          noites: number | null
          montagem_cama: string | null
          senha_apartamento: string | null
          metodo_entrada: Database["public"]["Enums"]["metodo_entrada"] | null
          reserva_numero: string | null
          observacoes: string | null
          criado_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          unidade_id: string
          tipo: Database["public"]["Enums"]["tarefa_tipo"]
          prioridade?: Database["public"]["Enums"]["tarefa_prioridade"]
          status?: Database["public"]["Enums"]["tarefa_status"]
          responsavel_id?: string | null
          vistoriador_id?: string | null
          ordem_dia?: number | null
          data_prevista?: string
          hora_prevista?: string | null
          iniciado_em?: string | null
          finalizado_em?: string | null
          tempo_total_min?: number | null
          hospedes?: number | null
          noites?: number | null
          montagem_cama?: string | null
          senha_apartamento?: string | null
          metodo_entrada?: Database["public"]["Enums"]["metodo_entrada"] | null
          reserva_numero?: string | null
          observacoes?: string | null
          criado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["tarefas"]["Insert"]>
        Relationships: [
          { foreignKeyName: "tarefas_unidade_id_fkey"; columns: ["unidade_id"]; isOneToOne: false; referencedRelation: "unidades"; referencedColumns: ["id"] },
        ]
      }
      tarefa_camareiras: {
        Row: { tarefa_id: string; user_id: string }
        Insert: { tarefa_id: string; user_id: string }
        Update: Partial<Database["public"]["Tables"]["tarefa_camareiras"]["Insert"]>
        Relationships: [
          { foreignKeyName: "tarefa_camareiras_tarefa_id_fkey"; columns: ["tarefa_id"]; isOneToOne: false; referencedRelation: "tarefas"; referencedColumns: ["id"] },
        ]
      }
      vistoria_demandas: {
        Row: {
          id: string
          tarefa_id: string
          texto: string
          concluido: boolean
          concluido_por: string | null
          concluido_em: string | null
          criado_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tarefa_id: string
          texto: string
          concluido?: boolean
          concluido_por?: string | null
          concluido_em?: string | null
          criado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["vistoria_demandas"]["Insert"]>
        Relationships: [
          { foreignKeyName: "vistoria_demandas_tarefa_id_fkey"; columns: ["tarefa_id"]; isOneToOne: false; referencedRelation: "tarefas"; referencedColumns: ["id"] },
        ]
      }
      tempo_registros: {
        Row: {
          id: string
          tarefa_id: string
          user_id: string
          inicio: string
          fim: string | null
          duracao_min: number | null
          tipo: string
          created_at: string
        }
        Insert: {
          id?: string
          tarefa_id: string
          user_id: string
          inicio?: string
          fim?: string | null
          duracao_min?: number | null
          tipo?: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["tempo_registros"]["Insert"]>
        Relationships: [
          { foreignKeyName: "tempo_registros_tarefa_id_fkey"; columns: ["tarefa_id"]; isOneToOne: false; referencedRelation: "tarefas"; referencedColumns: ["id"] },
        ]
      }
      solicitacoes: {
        Row: {
          id: string
          unidade_id: string
          tarefa_id: string | null
          tipo: Database["public"]["Enums"]["solicitacao_tipo"]
          descricao: string | null
          status: Database["public"]["Enums"]["solicitacao_status"]
          reserva_numero: string | null
          data_referencia: string
          criado_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          unidade_id: string
          tarefa_id?: string | null
          tipo: Database["public"]["Enums"]["solicitacao_tipo"]
          descricao?: string | null
          status?: Database["public"]["Enums"]["solicitacao_status"]
          reserva_numero?: string | null
          data_referencia?: string
          criado_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["solicitacoes"]["Insert"]>
        Relationships: [
          { foreignKeyName: "solicitacoes_unidade_id_fkey"; columns: ["unidade_id"]; isOneToOne: false; referencedRelation: "unidades"; referencedColumns: ["id"] },
        ]
      }
      liberacoes: {
        Row: {
          id: string
          unidade_id: string
          liberado_por: string
          liberado: boolean
          observacoes: string | null
          data_referencia: string
          created_at: string
        }
        Insert: {
          id?: string
          unidade_id: string
          liberado_por: string
          liberado: boolean
          observacoes?: string | null
          data_referencia?: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["liberacoes"]["Insert"]>
        Relationships: [
          { foreignKeyName: "liberacoes_unidade_id_fkey"; columns: ["unidade_id"]; isOneToOne: false; referencedRelation: "unidades"; referencedColumns: ["id"] },
        ]
      }
      audit_log: {
        Row: {
          id: string
          user_id: string | null
          acao: string
          tabela: string
          registro_id: string | null
          detalhes: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          acao: string
          tabela: string
          registro_id?: string | null
          detalhes?: Record<string, unknown> | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      has_role: { Args: { _user_id: string; _role: Database["public"]["Enums"]["app_role"] }; Returns: boolean }
      has_any_role: { Args: { _user_id: string; _roles: Database["public"]["Enums"]["app_role"][] }; Returns: boolean }
    }
    Enums: {
      app_role: "camareira" | "vistoriador" | "atendimento" | "operacional" | "manager" | "super_admin" | "pending_user"
      unidade_status: "pendente" | "em_limpeza" | "em_vistoria" | "aguardando_liberacao" | "liberado" | "bloqueado"
      tarefa_status: "pendente" | "em_andamento" | "pausada" | "concluida" | "cancelada"
      tarefa_tipo: "limpeza_checkout" | "limpeza_intermediaria" | "vistoria" | "manutencao" | "enxoval" | "apoio_operacional"
      tarefa_prioridade: "baixa" | "media" | "alta" | "urgente"
      tipo_imovel: "apartamento" | "casa" | "studio" | "cobertura" | "flat"
      tipo_cama: "casal" | "solteiro" | "queen" | "king" | "beliche" | "sofa_cama" | "berco"
      metodo_entrada: "email" | "app" | "app_envio_dados" | "whatsapp" | "foto_cadastro"
      solicitacao_tipo: "berco" | "cama_extra" | "enxoval_adicional" | "travesseiros_extras" | "checkin_antecipado" | "checkout_tardio" | "outro"
      solicitacao_status: "pendente" | "atendida" | "cancelada"
    }
  }
}
