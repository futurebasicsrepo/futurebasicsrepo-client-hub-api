// Go-live checklists: what has to happen before a site we built goes live, split between the client and Future Basics. Pushed into a client's room as tasks on its
// board (work_assignments, source 'go-live', tied to the project): the client's land in their hub under Needs attention and on the project; ours land on the work home.
// The Shopify list follows the theme's own setup steps (themes/common-ground/README.md).
export const GO_LIVE = {
  shopify: {
    label: 'Shopify store launch',
    items: [
      { who: 'client', title: 'Look through the prototype on your phone and computer and send us your notes', notes: 'Every page: home, a collection, a product, the cart, Sell, About and Contact. Use Send notes on the site in your hub.' },
      { who: 'client', title: 'Give every product a brand (Vendor), a Product type and a Size option', notes: 'These are what shoppers filter by. Product type is Sneakers, Tees, Hats, Collectibles and so on.' },
      { who: 'client', title: 'Add a picture to each collection', notes: 'The "Pick a lane" tiles and the Shop menu use them.' },
      { who: 'client', title: 'Send the words for About, Contact and Sell, and check your store policies', notes: 'Returns, shipping, privacy and terms (Settings, Policies).' },
      { who: 'client', title: 'Add Future Basics as a collaborator on your Shopify store', notes: 'Settings, Users and permissions, Collaborators: themes, apps, navigation and products.' },
      { who: 'client', title: 'Check shipping rates, taxes and payments in Shopify', notes: 'Place a test order before launch day.' },
      { who: 'client', title: 'Agree the launch date and approve going live', notes: 'The new theme is published only when you say so.' },
      { who: 'fb', title: 'Upload the theme to the store as an unpublished draft', notes: 'Online Store, Themes, Add theme (or Push to a store, Send the site itself). Do not publish.' },
      { who: 'fb', title: 'Set up navigation: the main menu (Sell, About, Contact) and the Shop menu', notes: 'Optional shop-menu under Header, Shop dropdown menu; otherwise every collection is listed.' },
      { who: 'fb', title: 'Turn on the Search & Discovery filters', notes: 'Vendor (Brand), Product type, Size, Price, Availability, and Color or tags if used.' },
      { who: 'fb', title: 'Connect the Sell page to the make-an-offer service and send a test offer end to end', notes: 'Photos in, offer out, the staff counter, and the emails.' },
      { who: 'fb', title: 'Check every page on phone and desktop, with the hero picture and motion level agreed', notes: 'Home, collection with filters, product, cart, Sell, About, Contact.' },
      { who: 'fb', title: 'Check speed, page titles and descriptions, and redirects from old addresses', notes: '' },
      { who: 'fb', title: 'Publish the theme on launch day and watch orders and offers for 48 hours', notes: '' }
    ]
  },
  site: {
    label: 'Website launch',
    items: [
      { who: 'client', title: 'Look through the prototype on your phone and computer and send us your notes', notes: 'Use Send notes on the site in your hub.' },
      { who: 'client', title: 'Send the final words, pictures and contact details', notes: '' },
      { who: 'client', title: 'Give us access to your domain (DNS) or tell us who manages it', notes: '' },
      { who: 'client', title: 'Agree the launch date and approve going live', notes: '' },
      { who: 'fb', title: 'Put the final words and pictures in and check every page on phone and desktop', notes: '' },
      { who: 'fb', title: 'Check speed, page titles and descriptions, forms and redirects from old addresses', notes: '' },
      { who: 'fb', title: 'Point the domain at the new site and check https', notes: '' },
      { who: 'fb', title: 'Go live and watch the site for 48 hours', notes: '' }
    ]
  }
};
export const TEMPLATE_KEYS = Object.keys(GO_LIVE);
// which list fits a build: a Shopify one gets the store launch, anything else the website launch
export const templateFor = ({ hosting = '', url = '' } = {}) => (hosting === 'shopify' || /\.myshopify\.com/i.test(String(url)) ? 'shopify' : 'site');
