/* No 'use server' - static export compatible */

/**
 * @fileOverview An AI agent for suggesting optimal groupings of Parties based on transaction history and metadata.
 *
 * - suggestPartyGrouping - A function that handles the party grouping suggestion process.
 * - SuggestPartyGroupingInput - The input type for the suggestPartyGrouping function.
 * - SuggestPartyGroupingOutput - The return type for the suggestPartyGrouping function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestPartyGroupingInputSchema = z.object({
  transactionHistory: z.string().describe('The transaction history of the party.'),
  metadata: z.string().describe('The metadata associated with the party.'),
  availableGroups: z.array(z.string()).describe('The list of available party groups.'),
});
export type SuggestPartyGroupingInput = z.infer<typeof SuggestPartyGroupingInputSchema>;

const SuggestPartyGroupingOutputSchema = z.object({
  suggestedGroup: z.string().describe('The suggested party group for the transaction.'),
  reasoning: z.string().describe('The reasoning behind the group suggestion.'),
});
export type SuggestPartyGroupingOutput = z.infer<typeof SuggestPartyGroupingOutputSchema>;

export async function suggestPartyGrouping(input: SuggestPartyGroupingInput): Promise<SuggestPartyGroupingOutput> {
  return suggestPartyGroupingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestPartyGroupingPrompt',
  input: {schema: SuggestPartyGroupingInputSchema},
  output: {schema: SuggestPartyGroupingOutputSchema},
  prompt: `You are an expert accounting assistant specializing in suggesting optimal party groupings based on transaction history and metadata.

You will use the transaction history and metadata to suggest the most appropriate party group from the available groups.

Transaction History: {{{transactionHistory}}}
Metadata: {{{metadata}}}
Available Groups: {{#each availableGroups}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}

Based on this information, which party group is most suitable for this transaction? Explain your reasoning.

Suggested Group: {{suggestedGroup}}
Reasoning: {{reasoning}}`,
});

const suggestPartyGroupingFlow = ai.defineFlow(
  {
    name: 'suggestPartyGroupingFlow',
    inputSchema: SuggestPartyGroupingInputSchema,
    outputSchema: SuggestPartyGroupingOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
