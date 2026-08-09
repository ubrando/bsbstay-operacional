import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/cadastro")({
  component: CadastroPage,
});

// Só formato — não valida se o número existe de verdade. Normaliza pra
// dígitos primeiro em vez de tentar casar toda variação de pontuação
// (com/sem parênteses, espaço ou traço) num regex só.
function validarTelefoneBR(v: string): boolean {
  const digitos = v.replace(/\D/g, "");
  return /^\d{10,11}$/.test(digitos); // DDD + 8 (fixo) ou 9 (celular) dígitos
}

const cadastroSchema = z
  .object({
    nomeCompleto: z
      .string()
      .trim()
      .min(3, "Informe pelo menos 3 caracteres")
      .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, "Informe nome e sobrenome"),
    email: z.string().trim().min(1, "E-mail é obrigatório").email("E-mail inválido"),
    telefone: z.string().trim().refine((v) => !v || validarTelefoneBR(v), "Telefone inválido — use DDD + número"),
    senha: z
      .string()
      .min(8, "Pelo menos 8 caracteres")
      .regex(/[A-Za-z]/, "Pelo menos 1 letra")
      .regex(/[0-9]/, "Pelo menos 1 número"),
    confirmarSenha: z.string(),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: "As senhas não coincidem",
    path: ["confirmarSenha"],
  });

type CadastroForm = z.infer<typeof cadastroSchema>;

function mensagemErroCadastro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("already registered") || m.includes("already exists")) return "Esse e-mail já está cadastrado. Tente entrar em vez de se cadastrar de novo.";
  if (m.includes("password") && (m.includes("least") || m.includes("weak") || m.includes("should be"))) return "Senha muito curta — use pelo menos 6 caracteres.";
  if (m.includes("email") && m.includes("invalid")) return "E-mail inválido.";
  if (m.includes("unable to validate")) return "E-mail inválido.";
  return msg;
}

function CadastroPage() {
  const [enviado, setEnviado] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CadastroForm>({
    resolver: zodResolver(cadastroSchema),
    mode: "onTouched",
    defaultValues: { nomeCompleto: "", email: "", telefone: "", senha: "", confirmarSenha: "" },
  });

  const senha = watch("senha");
  const requisitosSenha = [
    { label: "Pelo menos 8 caracteres", ok: senha.length >= 8 },
    { label: "Pelo menos 1 letra", ok: /[A-Za-z]/.test(senha) },
    { label: "Pelo menos 1 número", ok: /[0-9]/.test(senha) },
  ];

  const cadastrar = handleSubmit(async (data) => {
    const { supabase } = await import("@/lib/supabase/client");
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.senha,
      options: { data: { nome_completo: data.nomeCompleto, telefone: data.telefone || null } },
    });
    if (error) return toast.error(mensagemErroCadastro(error.message));
    setEnviado(true);
  });

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-sm space-y-4 bg-background border rounded-lg p-6 shadow-sm text-center">
          <CheckCircle2 className="size-10 text-success mx-auto" />
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">Cadastro recebido!</h1>
            <p className="text-sm text-muted-foreground">Um administrador vai revisar e liberar seu acesso em breve.</p>
          </div>
          <Link to="/login">
            <Button variant="outline" className="w-full">
              Voltar para o login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <form onSubmit={cadastrar} className="w-full max-w-sm space-y-4 bg-background border rounded-lg p-6 shadow-sm" noValidate>
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">BSB Stay & Help Estadias</h1>
          <p className="text-sm text-muted-foreground">Criar cadastro — Módulo Operacional</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nome">Nome completo</Label>
          <Input id="nome" {...register("nomeCompleto")} />
          {errors.nomeCompleto && <p className="text-xs text-destructive">{errors.nomeCompleto.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" type="tel" placeholder="Opcional" {...register("telefone")} />
          {errors.telefone && <p className="text-xs text-destructive">{errors.telefone.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" type="password" {...register("senha")} />
          <ul className="space-y-0.5 pt-0.5">
            {requisitosSenha.map((r) => (
              <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-success" : "text-muted-foreground"}`}>
                {r.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                {r.label}
              </li>
            ))}
          </ul>
          {errors.senha && <p className="text-xs text-destructive">{errors.senha.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmar-senha">Confirmar senha</Label>
          <Input id="confirmar-senha" type="password" {...register("confirmarSenha")} />
          {errors.confirmarSenha && <p className="text-xs text-destructive">{errors.confirmarSenha.message}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Cadastrando..." : "Cadastrar"}
        </Button>
        <p className="text-sm text-center text-muted-foreground">
          Já tem conta?{" "}
          <Link to="/login" className="text-foreground underline underline-offset-2">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}
