import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

/** Searches only the facets returned by the paginated catalog endpoint. */
export default function CatalogFilterSelect({ id, label, value, options, onChange, disabled }: {
  id: string; label: string; value: string; options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open} disabled={disabled} className="appliance-combobox w-full justify-between gap-2 font-normal">
      <span className="truncate">{options.find(option => option.value === value)?.label || label}</span><ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="appliance-flow-theme appliance-filter-popover p-0">
      <Command><CommandInput placeholder={`Pesquisar ${label.toLocaleLowerCase('pt-BR')}…`} aria-label={`Pesquisar ${label}`} />
        <CommandList><CommandEmpty>Nenhuma opção encontrada.</CommandEmpty><CommandGroup>
          {options.map(option => <CommandItem key={option.value} value={option.label} onSelect={() => { onChange(option.value); setOpen(false); }}>
            <Check className={value === option.value ? 'mr-2 size-4' : 'mr-2 size-4 opacity-0'} aria-hidden="true" />{option.label}
          </CommandItem>)}
        </CommandGroup></CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
