import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ConfigFieldSchema {
    name: string;
    field_type: string;
    required: boolean;
    default: string | null;
    description: string;
}

interface AgentConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agentName: string;
    configSchema: ConfigFieldSchema[];
    savedConfig: Record<string, string>;
    onSave: (config: Record<string, string>) => void;
}

export function AgentConfigDialog({
    open,
    onOpenChange,
    agentName,
    configSchema,
    savedConfig,
    onSave,
}: AgentConfigDialogProps) {
    const [values, setValues] = useState<Record<string, string>>({});
    const prevOpenRef = useRef(false);

    useEffect(() => {
        if (!prevOpenRef.current && open) {
            const initial: Record<string, string> = {};
            for (const field of configSchema) {
                initial[field.name] = savedConfig[field.name] ?? field.default ?? '';
            }
            setValues(initial);
        }
        prevOpenRef.current = open;
    }, [configSchema, savedConfig, open]);

    const handleChange = (name: string, value: string) => {
        setValues((prev) => ({ ...prev, [name]: value }));
    };

    const missingRequired = configSchema
        .filter((f) => f.required && !values[f.name]?.trim())
        .map((f) => f.name);

    const handleSave = () => {
        if (missingRequired.length > 0) return;
        onSave(values);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='max-w-md bg-card'>
                <DialogHeader>
                    <DialogTitle className='flex items-center gap-2'>
                        <Settings className='h-4 w-4' />
                        Configure {agentName}
                    </DialogTitle>
                    <DialogDescription>
                        Set configuration values for this agent. Required fields are marked with *.
                    </DialogDescription>
                </DialogHeader>

                <div className='space-y-4 py-2'>
                    {configSchema.map((field) => (
                        <div key={field.name} className='space-y-1.5'>
                            <label
                                htmlFor={`config-${field.name}`}
                                className='text-sm font-medium leading-none'
                            >
                                {field.name}
                                {field.required ? (
                                    <span className='ml-0.5 text-destructive'>*</span>
                                ) : (
                                    <span className='ml-1.5 text-xs text-muted-foreground'>(optional)</span>
                                )}
                            </label>
                            {field.description ? (
                                <p className='text-xs text-muted-foreground'>{field.description}</p>
                            ) : null}
                            <Input
                                id={`config-${field.name}`}
                                type={field.field_type === 'number' ? 'number' : field.field_type === 'secret' ? 'password' : 'text'}
                                placeholder={field.default ?? ''}
                                value={values[field.name] ?? ''}
                                onChange={(e) => handleChange(field.name, e.target.value)}
                                className={cn(
                                    'h-9',
                                    field.required && !values[field.name]?.trim() && 'border-destructive/50',
                                )}
                            />
                        </div>
                    ))}
                </div>

                <DialogFooter>
                    <Button variant='outline' size='sm' onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        size='sm'
                        onClick={handleSave}
                        disabled={missingRequired.length > 0}
                    >
                        Save Configuration
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
