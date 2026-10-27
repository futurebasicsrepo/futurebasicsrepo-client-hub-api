# Pip, the helper mouse

A small guide that follows the pointer and walks a person through the page they are on, step by step: what to do, why, and what comes next. Clients get it on the hub and the tech pack editor; the team gets it on Home and Sales. Anyone can switch it on or off in one press.

## What a person sees

- **A Guide switch** at the bottom left of every page that loads `helper.js` (beside the menu on the work console). Press it, or press Alt+Shift+G, to turn Pip on or off. The choice is remembered in the browser. `?guide=on` and `?guide=off` in a link set it too, which is how a link in an email can start a walkthrough.
- **The mouse** trots after the pointer. When a step starts it runs to the thing to press and a green ring pulses around it; once the person moves the pointer away, it follows them again, and it keeps clear of small targets so it never covers what they are about to click. On a phone it sits in a sheet above the switch, since there is no pointer to follow.
- **A speech bubble** with the step number, a progress bar, **Do** (what to press or type), **Why** (what it is for), and **Next** (the step after this one). Buttons: Back, Next (Skip while a step is waiting for the person to act), Guides, Turn off.
- **It notices when the step is done.** Pressing the highlighted button, typing in the highlighted box, or opening the dialog the step asked for turns the bubble to "✓ Done" for a moment and moves on by itself. Someone who gets ahead of the guide (presses what a later step asks for) is not held back: the mouse catches up to that step.
- **Guides carry on across pages.** Creating a tech pack ends the "Start a tech pack" guide and the next page opens with "Check your tech pack draft". The last screen of a guide says what to do next and offers Replay.
- **Guides** lists every guide, ticks the finished ones, and starts any that fit the current page.

Pip stays out of the way of print, factory links (`/tp/…`) and frames.

## What is covered today

| Guide | Where | Steps |
| --- | --- | --- |
| Sign in to your room | hub, signed out | email, send the code, type the code, enter |
| Start a tech pack | hub | open the form, add a photo, pick a project, name it, describe it, create it |
| Find your way around | hub | projects, waiting on you, needs attention, invoices, the full guide |
| Check your tech pack draft | tech pack editor (client draft) | callouts, measurements, materials, submit |
| Your day | work Home | add a lead, my accounts, reach out today, prototypes, projects in flight, the menu |
| Win a deal | Sales | contacts, add a person, name, email, pipeline, move deals across |
| Plan a line and make concepts | Design Lab | the Lab's sections, a new plan, who it is for, making concepts, the board |
| Take a concept to a tech pack | Design Lab, a concept open | the check, the studio, the flats, approve, send to tech pack |
| Finish a concept in the studio | Lab studio | layers, AI changes, use as the concept picture |
| Draw and change the flats | Flats and placement | the drawing, Garment, Design (details, AI redraw), save, send on |
| Publish, send to a factory, review samples | tech pack (work console) | where it came from, publish, assign a factory, samples, review a sample |
| Review your line | hub, Design | the line, its flats, approve, ask for changes |

The design-to-factory guides follow one product from the line plan to a corrected sample, each offering the next; docs/design-to-factory.md is the same route on paper.

On any other page Pip says there is no guide here yet; the switch is still there so nobody has to hunt for it.

## Adding or changing a guide

Guides are plain data in `TOURS` at the top of `src/helper.js`. No other file needs to change.

```js
{
  id: 'staff-money', title: 'Invoice a won deal',          // id is saved in the browser to remember progress
  match: () => path() === '/money' && shown('#app'),        // true while this guide fits what is on screen
  steps: [
    { target: '#fromDeal',                                   // selector, list of selectors (first one on screen), or a function
      title: 'Pick the deal', do: 'Choose the deal you won.', why: 'The invoice is filled in from it.',
      done: 'click',                                         // 'click' | 'input' | a function that returns true | omit for a reading step
      after: 'Deal picked.',                                 // what the bubble says when it is done
      optional: true,                                        // skipped when the target is not on screen (an empty panel)
      wait: 'Waiting for the list…' }                        // what to say while the target is not there yet
  ],
  outro: 'What happens after the last step.',
  next: { tour: 'another-id', label: 'Do this next' }        // optional: offered when the guide ends, and opened first on the next page
}
```

Rules that keep guides honest:

- `match` decides when a guide applies, so it should look at the page, not the address alone (the hub is one page with a sign-in, a list and a project view).
- Every step needs `title`, `do` and `why`; the journey checks this. Write them from the person's side of the screen: what they press, what it gets them.
- Prefer `done: 'click'` for tabs and buttons. A state check such as "the tab is open" is already true for the default tab, so the step would finish before the person did anything.
- `title`, `do`, `why` and `after` can be functions when the text depends on the page (the Create button's label changes when there is no photo).
- A guide the page redraws under is not dropped at once: it stays until its page has been gone for a few seconds.

## Where it is loaded

`<script src="/helper.js" defer></script>` at the end of: the hub (`client.html`), the tech pack page, Home, Sales, the console (`admin.html`), Money, Factories, Intelligence, Prototypes, Builds admin, and the Design Lab, its studio and its flats. The server serves it at `/helper.js` (cached five minutes). It adds one `.fbh` element to the page and, when a modal dialog is open, moves it into the dialog so it stays on top and clickable.

## Tests

Journey J162 drives it in a browser: the switch, remembering the choice, the ring, following the pointer, finishing a step by doing it, moving into the open dialog, Back and Next, the hand-off to the next page, Turn off / reload / `?guide=on` / the keyboard shortcut, a phone, and the whole Home guide. It also checks that every guide has a title, a "do" and a "why" on each step and that every selector is valid.

## Not built yet

- The choice is per browser. Saving it per user (so it follows someone between devices) needs a small setting on the user.
- More guides: the Money hub, Factories, the tech pack for staff, approving version 1 and paying the deposit. Each is one entry in `TOURS`.
- Guides in other languages (the factory pages already have `hub-i18n.js`).
