import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
    value: string;
    label: string;
    keywords?: string[];
    disabled?: boolean;
}

interface SearchableSelectProps {
    value?: string;
    onValueChange: (value: string) => void;
    options: SearchableSelectOption[];
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    disabled?: boolean;
    className?: string;
    triggerTestId?: string;
    searchInputTestId?: string;
}

function normalizeText(value: string): string {
    return value.trim().toLowerCase();
}

export function SearchableSelect({
    value,
    onValueChange,
    options,
    placeholder = "Select option",
    searchPlaceholder = "Type to search...",
    emptyText = "No option found",
    disabled = false,
    className,
    triggerTestId,
    searchInputTestId,
}: SearchableSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");

    const selectedOption = React.useMemo(
        () => options.find((option) => option.value === value),
        [options, value],
    );

    const filteredOptions = React.useMemo(() => {
        const normalizedQuery = normalizeText(query);
        if (!normalizedQuery) {
            return options;
        }

        return options.filter((option) => {
            const candidates = [option.label, option.value, ...(option.keywords || [])]
                .map((candidate) => normalizeText(candidate));

            return candidates.some((candidate) => candidate.startsWith(normalizedQuery));
        });
    }, [options, query]);

    const handleSelect = (nextValue: string) => {
        onValueChange(nextValue);
        setOpen(false);
        setQuery("");
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn("w-full justify-between", !selectedOption && "text-muted-foreground", className)}
                    data-testid={triggerTestId}
                >
                    {selectedOption ? selectedOption.label : placeholder}
                    <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={searchPlaceholder}
                        value={query}
                        onValueChange={setQuery}
                        data-testid={searchInputTestId}
                    />
                    <CommandList>
                        <CommandEmpty>{emptyText}</CommandEmpty>
                        <CommandGroup>
                            {filteredOptions.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.value}
                                    disabled={option.disabled}
                                    onSelect={() => handleSelect(option.value)}
                                >
                                    <Check
                                        className={cn("me-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")}
                                    />
                                    {option.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
