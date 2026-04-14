export type Category = {
  id: string;
  name: string;
  slug: string;
};

export type Tag = {
  id: string;
  name: string;
  slug: string;
};

export type Article = {
  id: string;
  title: string;
  slug: string;
  content: string;
  publishedAt: string;
  eyecatch?: {
    url: string;
    width: number;
    height: number;
  };
  category?: Category;
  tags?: Tag[];
  wpPostId?: number;
};
