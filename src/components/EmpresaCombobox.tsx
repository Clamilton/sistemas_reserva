import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { Empresa } from "../types";
import { onlyDigits } from "../lib/matchEmpresa";

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

interface Props {
  empresas: Empresa[];
  selectedId: string | null;
  onSelect: (empresa: Empresa) => void;
}

export function EmpresaCombobox({ empresas, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const queryDigits = onlyDigits(query);
  const normalizedQuery = normalizeText(query);

  const filtered = query.trim()
    ? empresas.filter((e) => {
        const nomeMatch = normalizeText(e.nome).includes(normalizedQuery);
        const cnpjMatch = queryDigits.length > 0 && onlyDigits(e.cnpj).includes(queryDigits);
        return nomeMatch || cnpjMatch;
      })
    : empresas;

  const selected = empresas.find((e) => e.id === selectedId) ?? null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`input flex items-center justify-between text-left ${
          selected ? "" : "opacity-50"
        }`}
      >
        <span className="truncate">{selected ? selected.nome : "Selecione uma empresa..."}</span>
        <ChevronDown size={14} className="ml-2 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-[16px] border border-[color:var(--color-divider)] bg-[color:var(--color-surface)] elev-lg">
          <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3 py-2.5">
            <Search size={14} className="shrink-0 opacity-50" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou CNPJ..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs opacity-50">
                Nenhuma empresa encontrada — cadastre em "Empresas".
              </p>
            )}
            {filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  onSelect(e);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-sm hover:bg-accent-100"
              >
                <span>
                  <span className="block">{e.nome}</span>
                  <span className="block text-[11px] opacity-50">{e.cnpj}</span>
                </span>
                {e.id === selectedId && <Check size={14} className="shrink-0 text-accent-2-700" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
